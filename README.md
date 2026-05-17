# Private Mail Gateway

A high-security private mail gateway built with Next.js, featuring five-factor API authentication, AES-256-GCM encryption, and comprehensive security protections.

## Security Features

### Five-Factor API Authentication
- **API Key**: Identifies the client (stored in KV, encrypted)
- **TOTP**: 6-digit time-based one-time password (30s validity, ±1 clock drift allowed)
- **Config Key**: Identifies which mailbox configuration to use (passed via `x-config-key` header)
- **Request Signature**: HMAC-SHA256 signature of the request
- **Nonce**: Random string (min 16 chars) with timestamp validation (5 min window)

### Cryptographic Security
- **HKDF Key Derivation**: Master key → encryption key + signing key
- **AES-256-GCM Encryption**: All mailbox credentials encrypted at rest in Vercel KV
- **HKDF Info Labels**:
  - `aes-encryption-key` for configuration encryption
  - `hmac-signing-key` for request signatures

### Admin Panel Security
- **Three Security Levels**:
  - Level 0: Password only
  - Level 1: Password + TOTP
  - Level 2: Password + TOTP + DNS Emergency Code
- **CSRF Protection**: Double submit cookie pattern with cryptographically secure tokens
- **Rate Limiting**: Login attempts limited (5 per 15 min, emergency 3 per hour)
- **Session Management**: HttpOnly, Secure, SameSite=Strict cookies (30 min TTL)
- **Error Message Obfuscation**: Generic errors prevent user enumeration

### Network Security
- **SSRF Protection**: Custom implementation blocking private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, IPv6 private, link-local, etc.)
- **DNS Emergency Validation**: TXT record challenge for level 2 security fallback

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐
│   Client App    │────▶│        Mail Gateway (Vercel)      │
└─────────────────┘     │  ┌────────────────────────────┐   │
                        │  │    Admin Panel (/admin)     │   │
┌─────────────────┐     │  │  - Mailbox Configuration    │   │
│  External Mail  │◀───│  │  - API Key Management       │   │
│    Services     │     │  │  - Health Monitoring        │   │
└─────────────────┘     │  └────────────────────────────┘   │
                        │  ┌────────────────────────────┐   │
                        │  │    API Endpoints (/api)     │   │
                        │  │  - /api/v1/send            │   │
                        │  │  - /api/v1/receive         │   │
                        │  └────────────────────────────┘   │
                        │  ┌────────────────────────────┐   │
                        │  │    Vercel KV (Redis)        │   │
                        │  │  - Encrypted configs       │   │
                        │  │  - Sessions & rate limits   │   │
                        │  └────────────────────────────┘   │
                        └──────────────────────────────────┘
```

## Deployment

### Prerequisites

1. A Vercel account with Node.js runtime
2. A Vercel KV database (Redis)
3. A domain for emergency DNS validation (level 2 security)

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ADMIN_PASSWD` | Admin panel password | Yes |
| `TOTP_PASSWD` | Base32 encoded TOTP secret for admin login | Yes |
| `API_TOTP` | Base32 encoded TOTP secret for API requests | Yes |
| `ENCRYPTION_KEY` | 32-byte hex key (generate: `openssl rand -hex 32`) | Yes |
| `INITIAL_API_KEY` | Initial API key (stored encrypted) | Yes |
| `NOTIFY_EMAIL` | Email address for notifications | Yes |
| `NOTIFY_SMTP_HOST` | SMTP host for notification emails | Yes |
| `NOTIFY_SMTP_PORT` | SMTP port (587 or 465) | Yes |
| `NOTIFY_SMTP_USER` | SMTP username | Yes |
| `NOTIFY_SMTP_PASS` | SMTP password | Yes |
| `EMERGENCY_DOMAIN` | Domain for DNS TXT emergency validation | Yes |
| `ADMIN_SECURITY_LEVEL` | 0=password only, 1=+TOTP, 2=+DNS emergency | Yes |
| `KV_REST_API_URL` | Vercel KV REST API URL | Yes |
| `KV_REST_API_TOKEN` | Vercel KV REST API token | Yes |

### Deploy to Vercel

1. Fork this repository
2. Connect repository to Vercel
3. Configure all environment variables
4. Deploy with Node.js runtime

**Note**: Always access the admin panel over HTTPS.

## API Reference

### Admin API

#### Login
```
POST /api/admin/login
Content-Type: application/json

{
  "password": "admin_password",
  "totp": "123456",           // Required for level 1+
  "emergencyCode": "ABC123"   // Required for level 2
}
```

Response sets session cookie.

#### Logout
```
POST /api/admin/logout
```
Requires session cookie.

#### Get Configuration
```
GET /api/admin/config
```
Returns mailbox configurations (passwords masked) and API keys.

#### Update Configuration
```
PUT /api/admin/config
X-CSRF-Token: <csrf-token>

{
  "action": "addApiKey" | "revokeApiKey",
  "apiKeyId": "uuid",         // For revoke
  "mailboxes": [...]          // For mailbox update
}
```

#### Health Check
```
GET /api/admin/health
```
Returns SMTP/IMAP connectivity status for all mailboxes.

#### Connectivity Test
```
POST /api/admin/connectivity
X-CSRF-Token: <csrf-token>

{
  "target": "smtp.example.com:587" or "https://example.com"
}
```
Tests TCP connectivity with SSRF protection.

### Mail API

All mail API requests require these headers:
```
x-api-key: <api-key>
x-api-totp: <6-digit-totp>
x-config-key: <config-key>   // Mailbox identifier
x-request-timestamp: <unix-ms-timestamp>
x-request-nonce: <random-string-min-16-chars>
x-request-signature: <hmac-sha256-signature>
```

#### Send Email
```
POST /api/v1/send
Content-Type: application/json

{
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "text": "Plain text body",
  "html": "<p>HTML body</p>"  // Optional
}
```

#### Receive Email List
```
GET /api/v1/receive?limit=10&page=1
```

#### Receive Single Email
```
GET /api/v1/receive/<uid>
```

### Signature Calculation

```javascript
const stringToSign = `${method}\n${path}\n${sortedQueryString}\n${nonce}\n${timestamp}\n${body}`
const signature = hmacSHA256(stringToSign, signingKey).toString('hex')
```

Where:
- `method`: HTTP method (GET, POST, etc.)
- `path`: Request path including query string (e.g., `/api/v1/receive?configKey=mykey&limit=10`)
- `sortedQueryString`: Query parameters sorted alphabetically (including configKey)
- `nonce`: Random string, minimum 16 characters
- `timestamp`: Unix timestamp in milliseconds
- `body`: Request body as string (empty string for GET)
- `signingKey`: Derived from master key via HKDF

**Important**: The configKey parameter must be included in the signature calculation as part of the query string.

## API Key Management

- Maximum 3 active API keys per configuration
- When adding a 4th key, the oldest active key is automatically deprecated
- Deprecated keys remain valid for 24 hours
- Cannot revoke the last active API key
- New key creation triggers email notification

## Mailbox Configuration

Each mailbox configuration includes:

| Field | Description |
|-------|-------------|
| `configKey` | Unique identifier for the mailbox (alphanumeric, underscore, hyphen) |
| `email` | Email address |
| `smtpHost` | SMTP server hostname |
| `smtpPort` | SMTP port (587 for STARTTLS, 465 for SSL) |
| `smtpUser` | SMTP username |
| `smtpPass` | SMTP password (encrypted) |
| `smtpSecure` | Use implicit SSL/TLS |
| `imapHost` | IMAP server hostname |
| `imapPort` | IMAP port (993 for SSL) |
| `imapUser` | IMAP username |
| `imapPass` | IMAP password (encrypted) |
| `imapSecure` | Use implicit SSL/TLS |

## Emergency Login

When level 2 security is enabled and notification email fails:

1. The system provides an emergency code
2. Create a TXT record on `EMERGENCY_DOMAIN`: `TXT emergency-code=<code>`
3. System validates the DNS record to grant access
4. Rate limited to 3 attempts per hour

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Admin Login | 5 attempts | 15 minutes |
| Emergency Login | 3 attempts | 1 hour |
| API Requests (per key) | 10 requests | 1 minute |
| Receive Mail (per configKey) | 1 request | 10 seconds |

## Important Notice

API keys have full access to all configured mailboxes. This gateway is designed for single-user or single-organization use. Multi-tenant deployments would require an additional authorization layer.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Runtime**: Node.js
- **Database**: Vercel KV (Redis)
- **Encryption**: AES-256-GCM, HKDF, HMAC-SHA256
- **IMAP Client**: ImapFlow
- **SMTP**: Nodemailer
- **Authentication**: TOTP (otplib)

## Project Structure

```
/app
  /admin
    /page.tsx              # Admin dashboard
  /api
    /admin
      /login/route.ts          # Admin login
      /logout/route.ts         # Admin logout
      /config/route.ts         # Configuration management
      /health/route.ts         # Health check
      /connectivity/route.ts   # Connectivity test
    /v1
      /send/route.ts           # Send email
      /receive/route.ts        # List emails
      /receive/[uid]/route.ts  # Get single email
/lib
  /crypto.ts            # Encryption, key derivation, API key generation
  /security.ts         # TOTP, signature validation, rate limiting, nonce
  /session.ts          # Session & CSRF management
  /config.ts           # KV configuration storage (encrypted)
  /ssrf.ts             # SSRF protection (custom implementation)
  /email.ts            # Notification email sending
  /health.ts           # TCP connectivity check
  /env.ts              # Environment variables validation
  /types.ts            # TypeScript interfaces
```

## KV Storage Keys

| Key Pattern | Description |
|-------------|-------------|
| `config:email_configs` | Encrypted mailbox and API key configuration |
| `config:version` | Configuration version number for cache invalidation |
| `session:<id>` | Session data with CSRF token (30 min TTL) |
| `ratelimit:login:<ip>` | Login rate limit counter |
| `ratelimit:api:<key>` | API rate limit counter (per key) |
| `ratelimit:receive:<configKey>` | Receive mail rate limit (per mailbox) |
| `nonce:<nonce>` | Used nonce storage (15 min TTL) |
| `emergency:<code>` | Emergency login attempt counter |
