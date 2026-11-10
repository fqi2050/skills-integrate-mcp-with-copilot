# Mergington High School Activities API

A FastAPI application for viewing extracurricular activities and managing their
student rosters. Teachers must sign in to add or remove students; visitors can
view activity information and rosters.

## Features

- View all available extracurricular activities
- Teacher sign-in with hashed credentials and expiring sessions
- Teacher-only student registration and unregistration

## Getting Started

1. Install the dependencies:

   ```
   pip install -r requirements.txt
   ```

2. Copy `src/teachers.example.json` to `src/teachers.json`. This local
   credentials file is ignored by Git. Generate a PBKDF2 password hash without
   putting the password in shell history by running this from the repository
   root:

   ```
   python -c 'import getpass; from src.teacher_auth import hash_password; print(hash_password(getpass.getpass("Teacher password: ")))'
   ```

   Add a teacher entry to `src/teachers.json`:

   ```json
   {
     "teachers": [
       {
         "username": "teacher",
         "password_hash": "paste-the-generated-hash-here"
       }
     ]
   }
   ```

3. Configure a signing secret of at least 32 characters. Generate one with:

   ```
   python -c 'import secrets; print(secrets.token_urlsafe(32))'
   ```

   Set it as `SESSION_SECRET` in the server environment. For local HTTP
   development, `SESSION_COOKIE_SECURE=false` is the default. Set
   `SESSION_COOKIE_SECURE=true` when serving the application over HTTPS.

4. Run the application from the repository root:

   ```
   uvicorn src.app:app --reload
   ```

5. Open http://localhost:8000.

Set `TEACHERS_FILE` to use a credentials file at a different path. Never commit
`teachers.json` or store plaintext passwords in it. Teacher sessions expire
after eight hours; the cookie is HTTP-only and same-site, and write requests
also require a CSRF token.

## API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/activities` | View activities and participant rosters |
| GET | `/auth/session` | Check the current teacher session |
| POST | `/auth/login` | Sign in with a teacher username and password |
| POST | `/auth/logout` | Sign out (requires `X-CSRF-Token`) |
| POST | `/activities/{activity_name}/signup?email=student@mergington.edu` | Register a student (teacher session and `X-CSRF-Token` required) |
| DELETE | `/activities/{activity_name}/unregister?email=student@mergington.edu` | Unregister a student (teacher session and `X-CSRF-Token` required) |

Activity and roster data is stored in memory and resets when the server restarts.
