import fs from 'fs';
import path from 'path';

// Só executa se for produção
if (process.env.NODE_ENV === 'production') {
    const rootDir = process.cwd();
    const indexHtml = path.join(rootDir, 'index.html');
    const indexBackup = path.join(rootDir, 'index.original.html');

    if (fs.existsSync(indexHtml)) {
        try {
            console.log('[Hostinger Fix] Renomeando index.html da raiz para evitar conflito com arquivos estáticos...');
            fs.renameSync(indexHtml, indexBackup);
            console.log('[Hostinger Fix] Sucesso! index.html -> index.original.html');
        } catch (err) {
            console.error('[Hostinger Fix] Erro ao renomear:', err);
        }
    }
}
