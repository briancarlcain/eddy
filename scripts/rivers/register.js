// node register.js <id> <identifier>   e.g. middle-fork-salmon middleForkSalmon
const fs = require('fs');
const [id, ident] = process.argv.slice(2);
let r = fs.readFileSync('src/rivers.js', 'utf8');
if (!r.includes(`'../data/rivers/${id}.json'`)) {
  r = r.replace(/(import [^\n]+\.json';\n)(\nexport const DEFAULT_RIVER)/, `$1import ${ident} from '../data/rivers/${id}.json';\n$2`);
  const key = /^[a-z]+$/.test(id) ? id : `'${id}'`;
  r = r.replace(/(export const BUILTIN_RIVERS = \{[\s\S]*?)(\n\};)/, `$1\n  ${key}: { id: '${id}', ...${ident} },$2`);
  fs.writeFileSync('src/rivers.js', r);
  console.log('registered', id);
} else console.log('already registered', id);
