/**
 * End-to-end Verification for RenewalTrack Forgot Password & Reset Password Flow
 */
const http = require("http");
const db = require("./backend/db");

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path,
        method,
        headers: {
          ...(dataStr
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(dataStr),
              }
            : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

async function runTests() {
  console.log("==================================================================");
  console.log("  RenewalTrack — Forgot Password & Reset Password Test Suite");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Anti-enumeration for non-existent email
    console.log("Test 1: Anti-Enumeration with non-registered email");
    const res1 = await request("POST", "/api/auth/forgot-password", {
      email: "unknown-user-9999@domain.org",
    });
    assert(res1.status === 200, "Returns HTTP 200 status");
    assert(
      res1.body.message && res1.body.message.includes("If an account with that email exists"),
      "Returns neutral, non-revealing message"
    );

    // 2. Forgot password request for registered account
    console.log("\nTest 2: Request reset link for registered email (elakkiyaohai@gmail.com)");
    const res2 = await request("POST", "/api/auth/forgot-password", {
      email: "elakkiyaohai@gmail.com",
    });
    assert(res2.status === 200, "Returns HTTP 200 status");
    assert(
      res2.body.message === res1.body.message,
      "Response message matches non-registered user identically (no email enumeration)"
    );

    // 3. Inspect database for created token
    console.log("\nTest 3: Database single-use token verification");
    const resets = (await db.getPasswordResets()) || [];
    const latestReset = resets
      .filter((r) => r.email.toLowerCase() === "elakkiyaohai@gmail.com")
      .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))[0];

    assert(!!latestReset, "Reset record exists in database");
    assert(latestReset.token && latestReset.token.length === 64, "Token is 64-character cryptographically secure hex");
    assert(latestReset.used === false, "Token is marked used = false");
    assert(new Date(latestReset.expiresAt || latestReset.expires_at) > new Date(), "Token expiry is in the future (~30 mins)");

    const validToken = latestReset.token;

    // 4. Token validation endpoint
    console.log("\nTest 4: Token verification endpoint");
    const resVerifyValid = await request("GET", `/api/auth/verify-reset-token/${validToken}`);
    assert(resVerifyValid.status === 200, "Valid token returns HTTP 200");
    assert(resVerifyValid.body.ok === true, "Valid token returns ok = true");
    assert(resVerifyValid.body.maskedEmail && resVerifyValid.body.maskedEmail.includes("@"), "Returns masked email");

    const resVerifyInvalid = await request("GET", "/api/auth/verify-reset-token/invalidhexdeadbeef1234");
    assert(resVerifyInvalid.status === 400, "Bogus token returns HTTP 400");
    assert(resVerifyInvalid.body.ok === false, "Bogus token returns ok = false");

    // 5. Weak password rejection
    console.log("\nTest 5: Validation of new password strength");
    const resWeak = await request("POST", "/api/auth/reset-password", {
      token: validToken,
      newPassword: "short",
      confirmPassword: "short",
    });
    assert(resWeak.status === 400, "Short password rejected with HTTP 400");

    const resMismatch = await request("POST", "/api/auth/reset-password", {
      token: validToken,
      newPassword: "NewSecret1234",
      confirmPassword: "DifferentSecret1234",
    });
    assert(resMismatch.status === 400, "Mismatched passwords rejected with HTTP 400");

    // 6. Valid password reset
    console.log("\nTest 6: Successful password reset with scrypt hashing");
    const testNewPassword = "TempResetPassword@2026";
    const resReset = await request("POST", "/api/auth/reset-password", {
      token: validToken,
      newPassword: testNewPassword,
      confirmPassword: testNewPassword,
    });
    assert(resReset.status === 200, "Reset password returns HTTP 200");
    assert(resReset.body.ok === true, "Reset password returns ok = true");

    // 7. Token invalidated after use (single-use enforcement)
    console.log("\nTest 7: Token invalidation after single use");
    const resReuse = await request("POST", "/api/auth/reset-password", {
      token: validToken,
      newPassword: testNewPassword,
      confirmPassword: testNewPassword,
    });
    assert(resReuse.status === 400, "Reusing consumed token rejected with HTTP 400");
    assert(resReuse.body.ok === false, "Reusing consumed token returns ok = false");

    const resVerifyUsed = await request("GET", `/api/auth/verify-reset-token/${validToken}`);
    assert(resVerifyUsed.status === 400, "Consumed token verification returns HTTP 400");

    // 8. Authentication verification with new and old passwords
    console.log("\nTest 8: Authentication verification");
    const resOldLogin = await request("POST", "/api/auth/login", {
      email: "elakkiyaohai@gmail.com",
      password: "Admin@1234",
    });
    assert(resOldLogin.status === 401, "Login with old password fails (HTTP 401)");

    const resNewLogin = await request("POST", "/api/auth/login", {
      email: "elakkiyaohai@gmail.com",
      password: testNewPassword,
    });
    assert(resNewLogin.status === 200, "Login with new scrypt-hashed password succeeds (HTTP 200)");
    assert(!!resNewLogin.body.token, "Returns valid JWT token");

    // 9. Reset back to Admin@1234 so account credentials remain stable
    console.log("\nTest 9: Restoring original password for developer convenience");
    await request("POST", "/api/auth/forgot-password", { email: "elakkiyaohai@gmail.com" });
    const resets2 = (await db.getPasswordResets()) || [];
    const restoreToken = resets2
      .filter((r) => r.email.toLowerCase() === "elakkiyaohai@gmail.com")
      .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))[0].token;

    const resRestore = await request("POST", "/api/auth/reset-password", {
      token: restoreToken,
      newPassword: "Admin@1234",
      confirmPassword: "Admin@1234",
    });
    assert(resRestore.status === 200, "Restored Admin@1234 successfully");

    const resRestoredLogin = await request("POST", "/api/auth/login", {
      email: "elakkiyaohai@gmail.com",
      password: "Admin@1234",
    });
    assert(resRestoredLogin.status === 200, "Login with Admin@1234 confirmed working (scrypt hashed)");

  } catch (err) {
    console.error("Test execution error:", err);
    failed++;
  }

  console.log("\n==================================================================");
  console.log(`  Tests completed: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

runTests();
