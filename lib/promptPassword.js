// Demande un mot de passe dans le terminal sans l'afficher en clair, sans
// dépendance externe (juste readline + un peu de bidouille sur la sortie).
const readline = require('readline');

function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;

    process.stdout.write(question);

    let password = '';
    const onData = (char) => {
      char = char.toString('utf8');
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        stdin.setRawMode && stdin.setRawMode(false);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
        return;
      }
      if (char === '\u0003') { process.exit(1); } // Ctrl+C
      if (char === '\u007f' || char === '\b') { // backspace
        password = password.slice(0, -1);
        return;
      }
      password += char;
    };

    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

module.exports = { promptPassword };
