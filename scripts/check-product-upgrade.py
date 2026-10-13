#!/usr/bin/env python3
"""Test a previous database upgrade to product revision, backup, restore, and graceful restart."""
import datetime as dt
import argparse
import http.client
import json
import os
import pathlib
import socket
import sqlite3
import subprocess
import tempfile
import time

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--old', type=pathlib.Path, required=True, help='Previous project, with dist built')
parser.add_argument('--new', type=pathlib.Path, required=True, help='New project, with dist built')
parser.add_argument('--expected-old', type=int, default=38)
parser.add_argument('--expected-new', type=int, default=44)
arguments=parser.parse_args()
OLD=arguments.old.resolve()
NEW=arguments.new.resolve()
for project in (OLD, NEW):
    if not (project/'dist/server/index.js').is_file():
        parser.error(f'missing compiled server at {project / "dist/server/index.js"}; run npm run build first')

def get(port,path='/api/ready'):
    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=4)
    connection.request('GET',path,headers={'Host':'localhost'})
    response=connection.getresponse();raw=response.read();connection.close()
    return response.status,json.loads(raw)

def run(project,db_path,log_file):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env=os.environ.copy()
    env.update(NODE_ENV='test',PORT=str(port),DATABASE_PATH=str(db_path),WHATSAPP_MEDIA_DIR=str(db_path.parent/'media'))
    log=log_file.open('w')
    proc=subprocess.Popen(['node','dist/server/index.js'],cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT)
    try:
        for _ in range(80):
            if proc.poll() is not None:raise RuntimeError(f'exit {proc.returncode}: {log_file.read_text()[-1200:]}')
            try:
                status,body=get(port)
                if status==200 and body['database']=='ready':return proc,log,port
            except (OSError,TimeoutError):time.sleep(.1)
        raise RuntimeError(f'timeout: {log_file.read_text()[-1200:]}')
    except BaseException:
        proc.terminate();proc.wait(timeout=5);log.close();raise

def stop(proc,log):
    proc.terminate();proc.wait(timeout=6);log.close()
    assert proc.returncode==0,proc.returncode

with tempfile.TemporaryDirectory(prefix='lashdesigner-upgrade-') as temp:
    work=pathlib.Path(temp); database=work/'upgrade.db'
    proc,log,port=run(OLD,database,work/'old.log')
    assert get(port,'/api/health')[1]['version']==json.loads((OLD/'package.json').read_text())['version']
    stop(proc,log)
    print('PASS previous release initializes a disposable database')
    with sqlite3.connect(database) as source:
        before=source.execute('SELECT COUNT(*) FROM schema_migrations').fetchone()[0]
        source.execute('INSERT INTO platform_settings (key,value,updated_at) VALUES (?,?,?)',('qa-upgrade','preserved',dt.datetime.now(dt.timezone.utc).isoformat()))
        source.commit()
        with sqlite3.connect(work/'backup.db') as backup:source.backup(backup)
    print(f'PASS SQLite backup after {before} migrations')
    proc,log,port=run(NEW,database,work/'new.log')
    assert get(port,'/api/ready')==(200,{'ok':True,'database':'ready'})
    stop(proc,log)
    with sqlite3.connect(database) as upgraded:
        after=upgraded.execute('SELECT COUNT(*) FROM schema_migrations').fetchone()[0]
        assert upgraded.execute('SELECT value FROM platform_settings WHERE key = ?',('qa-upgrade',)).fetchone()[0]=='preserved'
        assert upgraded.execute('PRAGMA foreign_key_check').fetchall()==[]
    assert (before,after)==(arguments.expected_old,arguments.expected_new),(before,after)
    print(f'PASS new release opens previous database and preserves data ({after} migrations)')
    proc,log,port=run(NEW,work/'backup.db',work/'restored.log')
    assert get(port,'/api/ready')[0]==200
    stop(proc,log)
    with sqlite3.connect(work/'backup.db') as restored:
        assert restored.execute('SELECT value FROM platform_settings WHERE key = ?',('qa-upgrade',)).fetchone()[0]=='preserved'
        assert restored.execute('PRAGMA foreign_key_check').fetchall()==[]
    print('PASS backup restores into a fresh product revision process with intact data')
