#!/usr/bin/env python3
"""
Walks register -> login -> profile -> balance -> fund -> send against a
running Django Ninja server and prints PASS/FAIL per step. Uses only the
standard library (urllib) so there's nothing extra to install.

Usage:
    python3 smoke_test.py                       # assumes http://127.0.0.1:8000/api
    python3 smoke_test.py http://10.0.0.5:8000/api

Note on fund/send: api.py's do_fund()/do_send() are deliberately left as
TODO stubs (see the comments in api.py) pending real payment-provider and
ledger wiring, so this script checks that those two endpoints respond with
the right *shape* and status code — it does NOT assert the balance actually
changes, because it isn't supposed to yet. Once you wire real ledger writes
into those two functions, add a balance-changed assertion here to match.
"""
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/api'
PASS, FAIL = '\033[92mPASS\033[0m', '\033[91mFAIL\033[0m'
results = []


def call(method, path, body=None, token=None, extra_headers=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{BASE_URL}{path}', data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read() or '{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or '{}')


def check(label, condition, detail=''):
    results.append(condition)
    print(f'  [{PASS if condition else FAIL}] {label}' + (f' — {detail}' if detail and not condition else ''))


def main():
    print(f'\nSmoke-testing {BASE_URL}\n')
    email = f'smoketest.{uuid.uuid4().hex[:8]}@example.com'

    print('1. Register')
    status, body = call('POST', '/auth/register', {
        'full_name': 'Smoke Test',
        'email': email,
        'phone': '08011122233',
        'password': 'testpass123',
    })
    check('POST /auth/register returns 200 with tokens', status == 200 and 'access_token' in body, f'status={status} body={body}')
    access_token = body.get('access_token')

    print('2. Login with the same credentials')
    status, body = call('POST', '/auth/login', {'identifier': email, 'password': 'testpass123'})
    check('POST /auth/login returns 200 with tokens', status == 200 and 'access_token' in body, f'status={status} body={body}')

    print('3. Login with a wrong password')
    status, body = call('POST', '/auth/login', {'identifier': email, 'password': 'wrong'})
    check('POST /auth/login with bad password returns 401, not 500', status == 401, f'status={status} body={body}')

    print('4. Fetch profile (authenticated)')
    status, body = call('GET', '/profile/me', token=access_token)
    check('GET /profile/me returns 200', status == 200, f'status={status} body={body}')
    check('  ...and kapita_id was auto-generated', bool(body.get('kapita_id')), f'body={body}')

    print('5. Fetch profile with NO token (should be rejected)')
    status, _ = call('GET', '/profile/me')
    check('GET /profile/me with no token returns 401', status == 401, f'status={status}')

    print('6. Fetch wallet balance')
    status, body = call('GET', '/wallet/balance', token=access_token)
    check('GET /wallet/balance returns 200', status == 200, f'status={status} body={body}')

    print('7. Fund wallet WITHOUT an Idempotency-Key (should be rejected)')
    status, body = call('POST', '/wallet/fund', {'amount': 5000, 'channel': 'bank_transfer'}, token=access_token)
    check('POST /wallet/fund with no Idempotency-Key returns 400', status == 400, f'status={status} body={body}')

    print('8. Fund wallet WITH an Idempotency-Key')
    idem_key = str(uuid.uuid4())
    status, body = call('POST', '/wallet/fund', {'amount': 5000, 'channel': 'bank_transfer'},
                         token=access_token, extra_headers={'Idempotency-Key': idem_key})
    check('POST /wallet/fund returns 202 pending', status == 202, f'status={status} body={body}')

    print('9. Retry the SAME fund request with the SAME Idempotency-Key')
    status2, body2 = call('POST', '/wallet/fund', {'amount': 5000, 'channel': 'bank_transfer'},
                           token=access_token, extra_headers={'Idempotency-Key': idem_key})
    check('  ...returns the identical cached response, not a second charge', status2 == status and body2 == body,
          f'first={status}/{body} second={status2}/{body2}')

    print('10. Reuse the SAME Idempotency-Key with a DIFFERENT amount')
    status, body = call('POST', '/wallet/fund', {'amount': 9999, 'channel': 'card'},
                         token=access_token, extra_headers={'Idempotency-Key': idem_key})
    check('  ...is rejected with a 409 conflict', status == 409, f'status={status} body={body}')

    passed, total = sum(results), len(results)
    print(f'\n{passed}/{total} checks passed.\n')
    sys.exit(0 if passed == total else 1)


if __name__ == '__main__':
    main()
