import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const sourceRoots = ["backend/src/main/", "frontend/src/", "desktop/src/", "packages/"];
const textExtensions = new Set([".java", ".js", ".mjs", ".ts", ".vue", ".xml", ".yaml", ".yml"]);
const findings = [];

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  cwd: workspaceRoot,
  encoding: "utf8"
}).split("\0").filter(Boolean).map((file) => file.replaceAll("\\", "/"));

function read(file) {
  return readFileSync(resolve(workspaceRoot, file), "utf8");
}

function fail(file, rule, detail = "") {
  findings.push({ file, rule, detail });
}

let scanned = 0;
for (const file of files) {
  if (!sourceRoots.some((root) => file.startsWith(root))) continue;
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  if (file.includes("/test/") || file.includes("/__tests__/")) continue;

  let content;
  try { content = read(file); } catch { continue; }
  scanned += 1;

  if (/allowedOrigins?\s*\(\s*["']\*["']|allowedOriginPatterns?\s*\(\s*["']\*["']|@CrossOrigin\s*\([^)]*["']\*["']|Access-Control-Allow-Origin["'\s,:=]+\*/i.test(content)) {
    fail(file, "wildcard-cors");
  }

  if (/(?:localStorage|sessionStorage)\.setItem\s*\([^\n]*(?:password|passwd|reverify|invitation(?:Code)?)/i.test(content)) {
    fail(file, "browser-secret-persistence");
  }

  if (/\b(?:insert|update|save|put)\b[^\n]*(?:reverifyPassword|rawPassword|plainPassword|invitationCode)/i.test(content)) {
    fail(file, "server-secret-persistence");
  }

  // A pinned public download repository is not an application user identity.
  // Only exempt this exact URL in its download-only validator; any other use fails.
  const identityContent = file === 'frontend/src/utils/publicDownload.ts'
    ? content.replace('https://github.com/waaakong/MoYu-Station/releases/download/v', '')
    : content;
  if (/WaaaKong/i.test(identityContent)) fail(file, "username-based-admin-protection");

  const springBean = content.match(/@(Service|Component)\b[\s\S]*?public class\s+(\w+)/);
  if (springBean) {
    const className = springBean[2];
    const constructors = content.match(new RegExp(`(?:public\\s+)?${className}\\s*\\(`, "g")) ?? [];
    const hasDefaultConstructor = new RegExp(`${className}\\s*\\(\\s*\\)`).test(content);
    if (constructors.length > 1 && !hasDefaultConstructor && !/@Autowired\b/.test(content)) {
      fail(file, "ambiguous-spring-constructor-injection");
    }
  }

  if (/(?:getInstance\s*\(\s*["']MD5["']|DigestUtils\.md5|\.md5Hex\s*\()/i.test(content)
      && file !== "backend/src/main/java/com/studyroom/security/PasswordService.java") {
    fail(file, "md5-computation-outside-legacy-verifier");
  }
}

const applicationConfig = read("backend/src/main/resources/application.yml");
if (!/^\s*baseline-on-migrate:\s*false\s*$/m.test(applicationConfig)) {
  fail("backend/src/main/resources/application.yml", "flyway-auto-baseline-enabled");
}

const passwordServicePath = "backend/src/main/java/com/studyroom/security/PasswordService.java";
const passwordService = read(passwordServicePath);
if (!/public String encode\([^)]*\)[\s\S]*?return encoder\.encode\(rawPassword\);/.test(passwordService)
    || !/public String encodeLegacyUpgrade\([^)]*\)[\s\S]*?return encoder\.encode\(rawPassword\);/.test(passwordService)) {
  fail(passwordServicePath, "password-write-not-bcrypt");
}
if (!/private String legacyMd5\([^)]*\)/.test(passwordService)
    || !/matchesLegacyMd5\([^)]*\)/.test(passwordService)) {
  fail(passwordServicePath, "legacy-md5-not-isolated");
}

const invitationServicePath = "backend/src/main/java/com/studyroom/service/InvitationService.java";
const invitationService = read(invitationServicePath);
if (!/setCodeDigest\(digest\(code\)\)/.test(invitationService)
    || /set(?:Code|InvitationCode)\(code\)/.test(invitationService)) {
  fail(invitationServicePath, "invitation-plaintext-write");
}

const authServicePath = "backend/src/main/java/com/studyroom/service/AuthService.java";
const authService = read(authServicePath);
if (!/matchesLegacyMd5\(request\.getPassword\(\),\s*user\.getPasswordHash\(\)\)/.test(authService)
    || !/setPasswordHash\(passwordService\.encodeLegacyUpgrade\(request\.getPassword\(\)\)\)/.test(authService)) {
  fail(authServicePath, "legacy-md5-upgrade-not-bcrypt");
}

const auditServicePath = "backend/src/main/java/com/studyroom/service/AdminAuditService.java";
const auditService = read(auditServicePath);
const safeFields = auditService.match(/SAFE_FIELDS\s*=\s*Set\.of\(([\s\S]*?)\);/)?.[1] ?? "";
if (/(?:password|passwd|invitationCode|cookie|token|credential)/i.test(safeFields)) {
  fail(auditServicePath, "sensitive-audit-allowlist");
}

const securityContractPath = "backend/src/test/java/com/studyroom/security/AdminSecurityContractTest.java";
const securityContract = read(securityContractPath);
if (!/everyAdministrationMutationRequiresRecentVerification/.test(securityContract)
    || !/RequireRecentAdminVerification/.test(securityContract)) {
  fail(securityContractPath, "admin-mutation-contract-missing");
}

if (findings.length) {
  console.error("Identity boundary violations detected:");
  for (const finding of findings) {
    console.error(`- ${finding.file} [${finding.rule}]${finding.detail ? ` ${finding.detail}` : ""}`);
  }
  process.exit(1);
}

console.log(`Identity boundary scan passed for ${scanned} production source files.`);
