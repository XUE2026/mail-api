# Private Mail Gateway

A high-security private mail gateway built with Next.js and Vercel.

## Security Features

- **Five-factor API authentication**: API Key + TOTP + Config Key + Request Signature + Nonce
- **HKDF key derivation**: Encryption and signing keys derived from master key
- **AES-256-GCM encryption**: All configuration data encrypted at rest
- **CSRF protection**: Double submit cookie pattern
- **Rate limiting**: Both login and API endpoints protected
- **Session security**: HttpOnly, Secure, SameSite cookies
- **SSRF protection**: Network checks with ssrf-filter
- **Error message obfuscation**: Authentication failures return generic errors

## Deployment

### Prerequisites

1. A Vercel account
2. A Vercel KV database
3. A domain for emergency DNS validation

### Environment Variables

Set these in your Vercel project settings:

| Variable | Description | Required |
|----------|-------------|----------|
| `ADMIN_PASSWD` | Admin panel password | Yes |
| `TOTP_PASSWD` | Base32 encoded TOTP secret for admin | Yes |
| `API_TOTP` | Base32 encoded TOTP secret for API | Yes |
| `ENCRYPTION_KEY` | 32-byte hex key (generate with `openssl rand -hex 32`) | Yes |
| `INITIAL_API_KEY` | Initial API key (will be stored encrypted) | Yes |
| `NOTIFY_EMAIL` | Email to receive notifications | Yes |
| `NOTIFY_SMTP_HOST` | SMTP host for notifications | Yes |
| `NOTIFY_SMTP_PORT` | SMTP port (587 or 465) | Yes |
| `NOTIFY_SMTP_USER` | SMTP username | Yes |
| `NOTIFY_SMTP_PASS` | SMTP password | Yes |
| `EMERGENCY_DOMAIN` | Domain for emergency DNS validation | Yes |
| `ADMIN_SECURITY_LEVEL` | 0=password, 1=password+totp, 2=full | Yes |
| `KV_REST_API_URL` | Vercel KV URL | Yes |
| `KV_REST_API_TOKEN` | Vercel KV token | Yes |

### Deploy to Vercel

1. Fork this repository
2. Connect to Vercel
3. Set all environment variables
4. Deploy

**Note**: Always access the admin panel over HTTPS.

## API Usage

### Authentication

All API requests require:

```
Headers:
x-api-key: <your-api-key>
x-api-totp: <6-digit-totp>
x-request-timestamp: <unix-ms-timestamp>
x-request-nonce: <random-string-min-16-chars>
x-request-signature: <hmac-sha256-signature>
```

### Signature Calculation

```javascript
const stringToSign = `${method}\n${path}\n${sortedQueryString}\n${nonce}\n${timestamp}\n${body}`
const signature = hmacSHA256(stringToSign, signingKey).toString('hex')
```

### Send Email

```
POST /api/v1/send
Content-Type: application/json

{
  "configKey": "my-mailbox",
  "to": "recipient@example.com",
  "subject": "Hello",
  "text": "World",
  "html": "<p>World</p>"
}
```

### Receive Email List

```
GET /api/v1/receive?configKey=my-mailbox&limit=10&page=1
```

### Receive Single Email

```
GET /api/v1/receive/<uid>?configKey=my-mailbox
```

## API Key Management

- Maximum 3 active API keys
- When adding a 4th, oldest becomes deprecated
- Deprecated keys valid for 24 hours
- Cannot revoke last active key

## Important Notice

API keys have full access to all configured mailboxes. This gateway is designed for single-user or single-organization use. Multi-tenant deployments would require an additional authorization layer.

## Emergency Login

If notification email fails at level 2 security, a DNS TXT record emergency login is available.
