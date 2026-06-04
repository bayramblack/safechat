export type SupportedLang =
  | "bash"
  | "sh"
  | "shell"
  | "typescript"
  | "ts"
  | "tsx"
  | "javascript"
  | "js"
  | "jsx"
  | "sql"
  | "nginx";

interface Rule {
  pattern: string;
  cls: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BASH_RULES: Rule[] = [
  { pattern: `#[^\\n]*`, cls: "comment" },
  { pattern: `"(?:\\\\.|[^"\\\\])*"`, cls: "string" },
  { pattern: `'(?:\\\\.|[^'\\\\])*'`, cls: "string" },
  { pattern: `\\$\\{[^}]+\\}`, cls: "variable" },
  { pattern: `\\$\\w+`, cls: "variable" },
  {
    pattern: `\\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|return|export|local|true|false|set|unset|read|exit|trap|source)\\b`,
    cls: "keyword",
  },
  {
    pattern: `\\b(?:sudo|cd|ls|mkdir|rm|cp|mv|echo|cat|grep|sed|awk|tee|chmod|chown|systemctl|service|apt|apt-get|curl|wget|tar|unzip|git|pnpm|npm|node|psql|nginx|ufw|certbot|adduser|usermod|reboot|pm2|env|which|head|tail|find|sort|uniq|xargs|kill|killall|ps|df|du|free|uname|whoami|date|sleep|man|less|more|touch|ln|stat|sha256sum|openssl)\\b`,
    cls: "builtin",
  },
  { pattern: `\\s-{1,2}[A-Za-z][\\w-]*`, cls: "option" },
  { pattern: `\\b\\d+(?:\\.\\d+)?\\b`, cls: "number" },
];

const TS_RULES: Rule[] = [
  { pattern: `//[^\\n]*`, cls: "comment" },
  { pattern: `/\\*[\\s\\S]*?\\*/`, cls: "comment" },
  { pattern: "`(?:\\\\.|[^`\\\\])*`", cls: "string" },
  { pattern: `"(?:\\\\.|[^"\\\\])*"`, cls: "string" },
  { pattern: `'(?:\\\\.|[^'\\\\])*'`, cls: "string" },
  {
    pattern: `\\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|implements|interface|type|enum|export|import|from|as|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|super|null|undefined|true|false|void|public|private|protected|readonly|static|abstract|namespace|declare|default|yield|delete|with)\\b`,
    cls: "keyword",
  },
  {
    pattern: `\\b(?:string|number|boolean|any|unknown|never|object|Promise|Array|Record|Partial|Pick|Omit|Readonly|Map|Set|Date|RegExp|Error|JSON|Math|console)\\b`,
    cls: "type",
  },
  { pattern: `\\b\\d+(?:\\.\\d+)?\\b`, cls: "number" },
];

const SQL_RULES: Rule[] = [
  { pattern: `--[^\\n]*`, cls: "comment" },
  { pattern: `/\\*[\\s\\S]*?\\*/`, cls: "comment" },
  { pattern: `'(?:''|[^'])*'`, cls: "string" },
  {
    pattern: `\\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DATABASE|SCHEMA|VIEW|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|CONSTRAINT|UNIQUE|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON|AS|AND|OR|IN|IS|LIKE|BETWEEN|EXISTS|GROUP|BY|ORDER|LIMIT|OFFSET|HAVING|DISTINCT|UNION|ALL|GRANT|REVOKE|TO|USER|ROLE|WITH|PASSWORD|RETURNING|BEGIN|COMMIT|ROLLBACK|TRANSACTION|IF|THEN|ELSE|END|CASE|WHEN|TRUE|FALSE|TRIGGER|FUNCTION|PROCEDURE|LANGUAGE|EXTENSION|CASCADE|RESTRICT|TEMP|TEMPORARY|MATERIALIZED|REPLACE|VARYING|TIMESTAMP|TIMESTAMPTZ|SERIAL|BIGSERIAL|INTEGER|BIGINT|SMALLINT|TEXT|VARCHAR|CHAR|BOOLEAN|JSONB|JSON|UUID|BYTEA|NUMERIC|DECIMAL|REAL|DOUBLE|PRECISION|DATE|TIME|INTERVAL|select|from|where|insert|into|values|update|set|delete|create|table|database|schema|view|drop|alter|add|column|primary|key|foreign|references|not|null|default|constraint|unique|index|join|left|right|inner|outer|cross|on|as|and|or|in|is|like|between|exists|group|by|order|limit|offset|having|distinct|union|all|grant|revoke|to|user|role|with|password|returning|begin|commit|rollback|transaction|if|then|else|end|case|when|true|false|trigger|function|procedure|language|extension|cascade|restrict|temp|temporary|materialized|replace|varying|timestamp|timestamptz|serial|bigserial|integer|bigint|smallint|text|varchar|char|boolean|jsonb|json|uuid|bytea|numeric|decimal|real|double|precision|date|time|interval|Select|From|Where|Insert|Into|Values|Update|Delete|Create|Table)\\b`,
    cls: "keyword",
  },
  {
    pattern: `\\b(?:NOW|COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|CONCAT|LOWER|UPPER|LENGTH|SUBSTRING|TRIM|LTRIM|RTRIM|REPLACE|ROUND|FLOOR|CEIL|ABS|GREATEST|LEAST|EXTRACT|TO_CHAR|TO_TIMESTAMP|GEN_RANDOM_UUID|now|count|sum|avg|min|max|coalesce|nullif|cast|concat|lower|upper|length|substring|trim|ltrim|rtrim|replace|round|floor|ceil|abs|greatest|least|extract|to_char|to_timestamp|gen_random_uuid)\\b`,
    cls: "function",
  },
  { pattern: `\\b\\d+(?:\\.\\d+)?\\b`, cls: "number" },
];

const NGINX_RULES: Rule[] = [
  { pattern: `#[^\\n]*`, cls: "comment" },
  { pattern: `"(?:\\\\.|[^"\\\\])*"`, cls: "string" },
  { pattern: `'(?:\\\\.|[^'\\\\])*'`, cls: "string" },
  { pattern: `\\$\\w+`, cls: "variable" },
  {
    pattern: `\\b(?:server|location|http|events|upstream|map|if|types|stream|geo|split_clients|mail)\\b(?=\\s*\\{)`,
    cls: "keyword",
  },
  {
    pattern: `(?<![\\w-])(?:listen|server_name|root|index|return|rewrite|try_files|proxy_pass|proxy_set_header|proxy_http_version|proxy_buffering|proxy_redirect|proxy_read_timeout|proxy_connect_timeout|proxy_send_timeout|access_log|error_log|include|ssl_certificate|ssl_certificate_key|ssl_protocols|ssl_ciphers|ssl_prefer_server_ciphers|ssl_session_cache|ssl_session_timeout|client_max_body_size|client_body_timeout|gzip|gzip_types|gzip_min_length|gzip_vary|add_header|worker_processes|worker_connections|sendfile|keepalive_timeout|tcp_nopush|tcp_nodelay|types_hash_max_size|default_type|charset|set|alias|expires|allow|deny|auth_basic|auth_basic_user_file|fastcgi_pass|fastcgi_param|fastcgi_split_path_info|error_page|deny|allow|limit_req|limit_req_zone|limit_conn|limit_conn_zone|resolver|user|pid|daemon|env|use|multi_accept|accept_mutex)\\b`,
    cls: "directive",
  },
  { pattern: `\\b\\d+(?:\\.\\d+)?[kKmMgG]?\\b`, cls: "number" },
  { pattern: `\\b(?:on|off)\\b`, cls: "constant" },
];

function buildLang(rules: Rule[]): RegExp {
  const parts = rules.map((r) => `(?:${r.pattern})`);
  return new RegExp(parts.join("|"), "g");
}

interface CompiledLang {
  rules: Rule[];
  individual: RegExp[];
  combined: RegExp;
}

const LANGS: Record<string, CompiledLang> = {};

function getLang(lang: string): CompiledLang | null {
  const key = lang.toLowerCase();
  let normalized: string;
  switch (key) {
    case "bash":
    case "sh":
    case "shell":
    case "zsh":
      normalized = "bash";
      break;
    case "ts":
    case "tsx":
    case "typescript":
    case "js":
    case "jsx":
    case "javascript":
      normalized = "typescript";
      break;
    case "sql":
    case "postgres":
    case "postgresql":
    case "psql":
      normalized = "sql";
      break;
    case "nginx":
    case "conf":
      normalized = "nginx";
      break;
    default:
      return null;
  }

  if (LANGS[normalized]) return LANGS[normalized];

  let rules: Rule[];
  switch (normalized) {
    case "bash":
      rules = BASH_RULES;
      break;
    case "typescript":
      rules = TS_RULES;
      break;
    case "sql":
      rules = SQL_RULES;
      break;
    case "nginx":
      rules = NGINX_RULES;
      break;
    default:
      return null;
  }

  const compiled: CompiledLang = {
    rules,
    individual: rules.map((r) => new RegExp(`^(?:${r.pattern})`)),
    combined: buildLang(rules),
  };
  LANGS[normalized] = compiled;
  return compiled;
}

export function highlightCode(code: string, lang: string | null): string {
  if (!lang) return escapeHtml(code);
  const compiled = getLang(lang);
  if (!compiled) return escapeHtml(code);

  let out = "";
  let last = 0;
  // Reset lastIndex defensively; combined is a stateful /g regex.
  compiled.combined.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = compiled.combined.exec(code)) !== null) {
    if (m[0].length === 0) {
      compiled.combined.lastIndex++;
      continue;
    }
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));

    // Determine which rule matched by re-testing at this offset.
    let cls: string | null = null;
    for (let i = 0; i < compiled.individual.length; i++) {
      const sub = compiled.individual[i]!;
      const test = sub.exec(code.slice(m.index));
      if (test && test[0] === m[0]) {
        cls = compiled.rules[i]!.cls;
        break;
      }
    }
    if (cls) {
      out += `<span class="tok-${cls}">${escapeHtml(m[0])}</span>`;
    } else {
      out += escapeHtml(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

export function isLanguageSupported(lang: string): boolean {
  return getLang(lang) !== null;
}
