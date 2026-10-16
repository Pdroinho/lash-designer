#!/usr/bin/env python3
"""Live multi-professional booking checks with a disposable SQLite database."""
import datetime as dt
import argparse
import hashlib
import http.client
import json
import os
import pathlib
import secrets
import socket
import sqlite3
import subprocess
import tempfile
import time
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project', type=pathlib.Path, required=True, help='Extracted checkpoint 63 project, with dist built')
PROJECT = parser.parse_args().project.resolve()
if not (PROJECT / 'dist/server/index.js').is_file():
    parser.error(f'missing compiled server at {PROJECT / "dist/server/index.js"}; run npm run build first')
steps = []

def expect(label, actual, expected):
    if actual != expected:
        raise AssertionError(f'{label}: expected {expected!r}, got {actual!r}')
    steps.append(label)
    print(f'PASS {label}')

def request(port, method, uri, *, host='localhost', cookie=None, payload=None):
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=8)
    headers = {'Host': host}
    body = None
    if payload is not None:
        body = json.dumps(payload)
        headers['Content-Type'] = 'application/json'
    if cookie:
        headers['Cookie'] = f'session={cookie}'
    conn.request(method, uri, body, headers)
    response = conn.getresponse()
    raw = response.read()
    result = {'status': response.status, 'body': json.loads(raw) if raw and response.getheader('Content-Type','').startswith('application/json') else raw.decode('utf8'), 'headers': dict(response.getheaders())}
    conn.close()
    return result

def seed_session(dbpath, user_id):
    token = secrets.token_urlsafe(32)
    now = dt.datetime.now(dt.timezone.utc)
    with sqlite3.connect(dbpath, timeout=5) as db:
        db.execute('INSERT INTO auth_sessions (id,user_id,token_hash,persistent,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?,?)', (
            str(uuid.uuid4()), user_id, hashlib.sha256(token.encode()).hexdigest(), 0,
            now.isoformat(), now.isoformat(), (now + dt.timedelta(hours=12)).isoformat()))
    return token

with tempfile.TemporaryDirectory(prefix='lashdesigner-qa-') as temp:
    root = pathlib.Path(temp)
    dbpath = root / 'qa.db'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    config = os.environ.copy()
    config.update(NODE_ENV='test', PORT=str(port), DATABASE_PATH=str(dbpath), WHATSAPP_MEDIA_DIR=str(root/'media'), APP_BASE_URL='http://localhost')
    logpath = root / 'server.log'
    with logpath.open('w') as log:
        server = subprocess.Popen(['node','dist/server/index.js'], cwd=PROJECT, env=config, stdout=log, stderr=subprocess.STDOUT)
        try:
            for attempt in range(80):
                if server.poll() is not None:
                    raise RuntimeError(f'Server exited early: {server.returncode}')
                try:
                    request(port, 'GET', '/api/ready')
                    break
                except (OSError, TimeoutError):
                    time.sleep(.1)
            else:
                raise RuntimeError('Server readiness timed out')
            expect('ready uses a fresh migrated SQLite', request(port,'GET','/api/ready')['status'], 200)
            expect('public plan catalog is mounted', request(port,'GET','/api/public/billing/plans')['status'], 200)
            expect('anonymous DEV access is rejected', request(port,'GET','/api/dev/tenants')['status'], 401)
            expect('anonymous ADMIN access is rejected', request(port,'GET','/api/admin/services')['status'], 403)
            bootstrap = request(port,'POST','/api/dev/bootstrap',payload={'email':'dev.qa@example.test','phone':'11999990001','password':'TestPass123!'})
            expect('DEV bootstrap via the real API', bootstrap['status'], 200)
            expect('DEV bootstrap cannot repeat',request(port,'POST','/api/dev/bootstrap',payload={'email':'another.qa@example.test','phone':'11999990002','password':'TestPass123!'})['body'].get('code'),'BOOTSTRAP_DISABLED')
            with sqlite3.connect(dbpath) as db:
                dev_id = db.execute('SELECT id FROM users WHERE role = ?', ('DEV',)).fetchone()[0]
            dev_session = seed_session(dbpath, dev_id)
            expect('authenticated DEV tenant listing', request(port,'GET','/api/dev/tenants',cookie=dev_session)['status'],200)
            tenants = []
            for suffix in ('a','b'):
                slug=f'studio-{suffix}'
                result=request(port,'POST','/api/dev/tenants',cookie=dev_session,payload={
                    'name':f'QA Studio {suffix.upper()}','slug':slug,'primaryColor':'#884466',
                    'adminEmail':f'admin-{suffix}@example.test','adminPhone':f'1199999000{3 if suffix=="a" else 4}',
                    'adminPassword':'TestPass123!'})
                expect(f'create tenant {suffix} via DEV API',result['status'],200)
                tenants.append((slug,result['body']['tenant']['id'],result['body']['adminUser']['id']))
            with sqlite3.connect(dbpath) as db:
                expect('fresh migration has no foreign key violations',db.execute('PRAGMA foreign_key_check').fetchall(),[])
            admins=[seed_session(dbpath, tenant[2]) for tenant in tenants]
            host_a=f'{tenants[0][0]}.localhost'
            host_b=f'{tenants[1][0]}.localhost'
            blocked=request(port,'GET','/api/admin/services',host=host_a,cookie=admins[0])
            expect('inactive subscription blocks ADMIN routes',blocked['body'].get('code'),'SUBSCRIPTION_REQUIRED')
            paid=request(port,'POST','/api/admin/subscription/test-pay',host=host_a,cookie=admins[0],payload={})
            expect('local test payment activates subscription',paid['body'].get('status'),'ACTIVE')
            expect('ADMIN service list unlocked',request(port,'GET','/api/admin/services',host=host_a,cookie=admins[0])['status'],200)
            created=request(port,'POST','/api/admin/services',host=host_a,cookie=admins[0],payload={'name':'Extensão clássica','durationMinutes':60,'priceCents':11000})
            expect('ADMIN service create',created['status'],200)
            service_id=created['body']['service']['id']
            listed=request(port,'GET','/api/admin/professionals',host=host_a,cookie=admins[0])
            expect('default professional and 3-seat legacy limit',(len(listed['body']['professionals']),listed['body']['seatLimit']),(1,3))
            owner=listed['body']['professionals'][0]['id']
            import base64
            portrait='data:image/webp;base64,'+base64.b64encode((PROJECT/'public/placeholders/service-placeholder.webp').read_bytes()).decode()
            updated=request(port,'PATCH',f'/api/admin/professionals/{owner}',host=host_a,cookie=admins[0],payload={'photoUrl':portrait,'instagram':'studio.lashes','tiktok':'studio_lashes'})
            expect('professional profile photo and social handles save through real server',updated['status'],200)
            visible=request(port,'GET',f'/api/public/professionals?serviceId={service_id}',host=host_a)['body']['professionals'][0]
            expect('public professional exposes saved portrait and Instagram',(visible['photoUrl'],visible['instagram']),(portrait,'studio.lashes'))
            expect('public profile does not leak phone/email/userId',set(visible),{'id','name','photoUrl','instagram','tiktok'})
            expect('social URL injection rejected',request(port,'PATCH',f'/api/admin/professionals/{owner}',host=host_a,cookie=admins[0],payload={'instagram':'https://tracker.invalid/'})['status'],400)
            expect('brand presentation saves through tenant settings',request(port,'PATCH','/api/admin/tenant',host=host_a,cookie=admins[0],payload={'logoLayout':'FULL','logoSize':'L','secondaryColor':'#33272D','backgroundColor':'#FCF7F9'})['status'],200)
            brand=request(port,'GET','/api/public/tenant',host=host_a)['body']['tenant']
            expect('saved brand presentation reaches public client',(brand['logoLayout'],brand['logoSize']),('FULL','L'))
            expect('palette colors persist and reach public theme',(brand['secondaryColor'],brand['backgroundColor']),('#33272D','#FCF7F9'))
            expect('invalid suggested palette is rejected',request(port,'PATCH','/api/admin/tenant',host=host_a,cookie=admins[0],payload={'secondaryColor':'url(javascript:bad)'})['status'],400)
            expect('settings brand analysis route is mounted and refuses disabled AI',request(port,'POST','/api/admin/assistant/brand-suggestions',host=host_a,cookie=admins[0],payload={'businessName':'QA Studio','logoDataUrl':portrait})['body'].get('code'),'ASSISTANT_DISABLED')

            foreign=request(port,'GET','/api/public/tenant',host=host_b)['body']['tenant']
            expect('brand customization remains isolated from other tenant',(foreign['logoLayout'],foreign['logoSize']),('SYMBOL_NAME','M'))
            expect('arbitrary logo dimensions rejected',request(port,'PATCH','/api/admin/tenant',host=host_a,cookie=admins[0],payload={'logoSize':'900px'})['status'],400)

            primary_id=listed['body']['professionals'][0]['id']
            added=request(port,'POST','/api/admin/professionals',host=host_a,cookie=admins[0],payload={'name':'Bianca','serviceIds':[service_id]})
            expect('ADMIN creates second bookable professional',added['status'],201)
            second_id=added['body']['professional']['id']
            foreign=request(port,'PATCH',f'/api/admin/professionals/{tenants[1][1]}',host=host_a,cookie=admins[0],payload={'name':'Outro estúdio'})
            expect('ADMIN cannot edit other tenant professional',foreign['body'].get('code'),'PROFESSIONAL_NOT_FOUND')
            third=request(port,'POST','/api/admin/professionals',host=host_a,cookie=admins[0],payload={'name':'Carla','serviceIds':[]})
            expect('third seat is allowed',third['status'],201)
            fourth=request(port,'POST','/api/admin/professionals',host=host_a,cookie=admins[0],payload={'name':'Daniela','serviceIds':[]})
            expect('fourth seat requires another billing tier',fourth['body'].get('code'),'PROFESSIONAL_LIMIT')
            # Simulate only the verified subscription code: no payment provider is invoked by this check.
            with sqlite3.connect(dbpath) as db:
                db.execute("UPDATE subscriptions SET plan_code = 'TEAM_6' WHERE tenant_id = ?",(tenants[0][1],))
            expect('confirmed TEAM_6 unlocks six seats',request(port,'GET','/api/admin/professionals',host=host_a,cookie=admins[0])['body']['seatLimit'],6)
            for person in ('Daniela','Elisa','Fernanda'):
                expect(f'TEAM_6 accepts {person}',request(port,'POST','/api/admin/professionals',host=host_a,cookie=admins[0],payload={'name':person,'serviceIds':[]})['status'],201)
            blocked_seventh=request(port,'POST','/api/admin/professionals',host=host_a,cookie=admins[0],payload={'name':'Gabriela','serviceIds':[]})
            expect('TEAM_6 blocks seventh seat',blocked_seventh['body'].get('code'),'PROFESSIONAL_LIMIT')
            with sqlite3.connect(dbpath) as db:
                db.execute("UPDATE subscriptions SET plan_code = 'TEAM_15' WHERE tenant_id = ?",(tenants[0][1],))
            expect('confirmed TEAM_15 unlocks fifteen seats',request(port,'GET','/api/admin/professionals',host=host_a,cookie=admins[0])['body']['seatLimit'],15)
            expect('TEAM_15 accepts seventh seat',request(port,'POST','/api/admin/professionals',host=host_a,cookie=admins[0],payload={'name':'Gabriela','serviceIds':[]})['status'],201)
            own=request(port,'GET','/api/public/services',host=host_a)
            expect('public host resolves own service',len(own['body']['services']),1)
            expect('second host has isolated service list',len(request(port,'GET','/api/public/services',host=host_b)['body']['services']),0)
            cross=request(port,'GET','/api/admin/services',host=host_b,cookie=admins[0])
            expect('session from tenant A rejected on tenant B host',cross['status'],403)
            mismatch=request(port,'POST',f'/api/public/tenant/{tenants[1][0]}/appointments',host=host_a,payload={'serviceId':service_id,'startsAt':'2030-01-07T14:00:00.000Z','name':'Cliente Teste','phone':'11999990005'})
            expect('public booking rejects mismatched tenant host',mismatch['body'].get('code'),'TENANT_HOST_MISMATCH')
            # Next Monday at 14:00 UTC is 11:00 in the configured Sao Paulo timezone.
            today=dt.datetime.now(dt.timezone.utc).date()
            days=(0-today.weekday())%7 or 7
            date=today+dt.timedelta(days=days)
            starts=f'{date.isoformat()}T14:00:00.000Z'
            payload={'serviceId':service_id,'startsAt':starts,'name':'Cliente Teste','phone':'11999990005','marketingConsent':False}
            catalog=request(port,'GET',f'/api/public/professionals?serviceId={service_id}',host=host_a)
            expect('public service lists two eligible professionals',len(catalog['body']['professionals']),2)
            off_date=date+dt.timedelta(days=7)
            off_start=f'{off_date.isoformat()}T14:00:00.000Z'
            off_end=f'{off_date.isoformat()}T15:00:00.000Z'
            off=request(port,'POST',f'/api/admin/professionals/{second_id}/time-off',host=host_a,cookie=admins[0],payload={'startsAt':off_start,'endsAt':off_end,'reason':'Folga'})
            expect('ADMIN blocks a personal future slot',off['status'],201)
            off_id=off['body']['id']
            expect('other tenant cannot list personal time off',request(port,'GET',f'/api/admin/professionals/{second_id}/time-off',host=host_b,cookie=admins[1])['body'].get('code'),'SUBSCRIPTION_REQUIRED')
            blocked_booking=request(port,'POST','/api/public/appointments',host=host_a,payload={**payload,'startsAt':off_start,'professionalId':second_id})
            expect('public booking respects personal time off',blocked_booking['body'].get('code'),'SLOT_UNAVAILABLE')
            available_other=request(port,'GET',f'/api/public/staff-availability?serviceId={service_id}&date={off_date}',host=host_a)
            expect('time off affects only its professional',len(available_other['body']['professionals']),2)
            expect('other tenant cannot remove personal block',request(port,'DELETE',f'/api/admin/professionals/{second_id}/time-off/{off_id}',host=host_b,cookie=admins[1])['status'],403)
            expect('ADMIN can remove personal block',request(port,'DELETE',f'/api/admin/professionals/{second_id}/time-off/{off_id}',host=host_a,cookie=admins[0])['status'],200)
            first=request(port,'POST','/api/public/appointments',host=host_a,payload={**payload,'professionalId':primary_id})
            expect('public booking chooses first professional',(first['status'],first['body']['appointment']['professionalId']),(200,primary_id))
            availability=request(port,'GET',f'/api/public/staff-availability?serviceId={service_id}&date={date}',host=host_a)
            expect('availability preserves two separate calendars',len(availability['body']['professionals']),2)
            second=request(port,'POST','/api/public/appointments',host=host_a,payload={**payload,'professionalId':second_id,'phone':'11999990006','name':'Outra Cliente'})
            expect('second professional can serve same time',(second['status'],second['body']['appointment']['professionalId']),(200,second_id))
            deactivate=request(port,'PATCH',f'/api/admin/professionals/{second_id}',host=host_a,cookie=admins[0],payload={'active':False})
            expect('future booking prevents deactivating professional',deactivate['body'].get('code'),'PROFESSIONAL_HAS_APPOINTMENTS')
            conflicting_off=request(port,'POST',f'/api/admin/professionals/{second_id}/time-off',host=host_a,cookie=admins[0],payload={'startsAt':starts,'endsAt':f'{date.isoformat()}T15:00:00.000Z'})
            expect('time off cannot silently hide existing appointment',conflicting_off['body'].get('code'),'TIME_OFF_APPOINTMENT_CONFLICT')
            collision=request(port,'POST','/api/public/appointments',host=host_a,payload={**payload,'phone':'11999990007'})
            expect('any available rejects fully occupied slot',collision['body'].get('code'),'SLOT_UNAVAILABLE')
            same=request(port,'POST','/api/public/appointments',host=host_a,payload={**payload,'professionalId':primary_id,'phone':'11999990008'})
            expect('same professional cannot double book',same['body'].get('code'),'SLOT_UNAVAILABLE')
            with sqlite3.connect(dbpath) as db:
                expect('two bookings persist under distinct professionals',db.execute('SELECT COUNT(DISTINCT professional_id) FROM appointments WHERE tenant_id = ?', (tenants[0][1],)).fetchone()[0],2)
                expect('booking creates two WhatsApp contacts',db.execute('SELECT COUNT(*) FROM whatsapp_conversations WHERE tenant_id = ?', (tenants[0][1],)).fetchone()[0],2)
                expect('no contact leaked to other tenant',db.execute('SELECT COUNT(*) FROM whatsapp_conversations WHERE tenant_id = ?', (tenants[1][1],)).fetchone()[0],0)
                expect('contacts retain client names',db.execute('SELECT COUNT(*) FROM whatsapp_conversations WHERE tenant_id = ? AND display_name IN (?,?)', (tenants[0][1],'Cliente Teste','Outra Cliente')).fetchone()[0],2)
                expect('booking does not fabricate WhatsApp messages',db.execute('SELECT COUNT(*) FROM whatsapp_messages WHERE tenant_id = ?', (tenants[0][1],)).fetchone()[0],0)
                expect('other tenant has no appointment',db.execute('SELECT COUNT(*) FROM appointments WHERE tenant_id = ?', (tenants[1][1],)).fetchone()[0],0)
                expect('booking without consent records no marketing opt-in',db.execute('SELECT COALESCE(SUM(marketing_whatsapp_opt_in), 0) FROM clients WHERE tenant_id = ?', (tenants[0][1],)).fetchone()[0],0)
            expect('unknown API returns 404',request(port,'GET','/api/unknown')['status'],404)
        except Exception:
            log.flush()
            print('SERVER LOG TAIL:', '\n'.join(logpath.read_text().splitlines()[-20:]))
            raise
        finally:
            server.terminate()
            try: server.wait(timeout=6)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        expect('server shuts down gracefully',server.returncode,0)
print(f'{len(steps)} live checks passed')
