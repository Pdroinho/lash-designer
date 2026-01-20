import fs from 'fs';
import path from 'path';

// Função para restaurar o nome original
function restore() {
    const rootDir = process.cwd();
    const indexHtml = path.join(rootDir, 'index.html');
    const indexBackup = path.join(rootDir, 'index.original.html');

    if (fs.existsSync(indexBackup)) {
        try {
            console.log('[Hostinger Fix] Restaurando index.html original antes do build...');
            fs.renameSync(indexBackup, indexHtml);
        } catch (err) {
            console.error('[Hostinger Fix] Erro ao restaurar:', err);
        }
    }
}

// Função para renomear (pós-build)
function rename() {
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

// Argumentos da linha de comando
const args = process.argv.slice(2);
const command = args[0];

if (command === 'restore') {
    restore();
} else if (command === 'rename') {
    // Só renomeia se for produção
    if (process.env.NODE_ENV === 'production') {
        rename();
    }
} else {
    // Comportamento padrão (retrocompatibilidade)
    if (process.env.NODE_ENV === 'production') {
        rename();
    }
}
