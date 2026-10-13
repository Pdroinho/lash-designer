import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { syncBookedClientConversation } from './clientConversationSync.js'
test('agendamento sincroniza contato sem duplicar histórico, alterar consentimento ou enviar mensagem', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE clients (tenant_id TEXT,user_id TEXT,name TEXT,phone_normalized TEXT,marketing_whatsapp_opt_in INTEGER);
 CREATE TABLE whatsapp_conversations (id TEXT PRIMARY KEY,tenant_id TEXT,phone_normalized TEXT,display_name TEXT,client_user_id TEXT,created_at TEXT,updated_at TEXT,unread_count INTEGER DEFAULT 0,last_message_preview TEXT,UNIQUE(tenant_id,phone_normalized));
 INSERT INTO clients VALUES ('one','ana','Ana','5571999999999',0),('two','bia','Bia','5571999999999',1),('one','empty','Sem telefone',NULL,0);`)
  try {
    syncBookedClientConversation(db, 'one', 'ana')
    syncBookedClientConversation(db, 'one', 'ana')
    assert.equal(
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM whatsapp_conversations')
          .get() as { n: number }
      ).n,
      1,
    )
    db.prepare(
      "UPDATE whatsapp_conversations SET unread_count=2,last_message_preview='Mensagem anterior' WHERE tenant_id='one'",
    ).run()
    db.prepare(
      "UPDATE clients SET name='Ana atualizada' WHERE user_id='ana'",
    ).run()
    syncBookedClientConversation(db, 'one', 'ana')
    syncBookedClientConversation(db, 'two', 'bia')
    syncBookedClientConversation(db, 'one', 'bia')
    syncBookedClientConversation(db, 'one', 'empty')
    const rows = db
      .prepare(
        'SELECT tenant_id,display_name,unread_count,last_message_preview FROM whatsapp_conversations ORDER BY tenant_id',
      )
      .all()
    assert.deepEqual(rows, [
      {
        tenant_id: 'one',
        display_name: 'Ana atualizada',
        unread_count: 2,
        last_message_preview: 'Mensagem anterior',
      },
      {
        tenant_id: 'two',
        display_name: 'Bia',
        unread_count: 0,
        last_message_preview: null,
      },
    ])
    assert.equal(
      (
        db
          .prepare(
            "SELECT marketing_whatsapp_opt_in AS value FROM clients WHERE user_id='ana'",
          )
          .get() as { value: number }
      ).value,
      0,
    )
  } finally {
    db.close()
  }
})
