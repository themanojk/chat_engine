# Release Checklist

Use this checklist before publishing a new `@littra/chat-engine-backend` version.

## 1. Versioning

- Decide release type: `major`, `minor`, or `patch`.
- Update `version` in [package.json](/Users/manojkumar/Developer/Littra/chat_engine/backend/package.json).
- Move entries from `Unreleased` to a dated section in [CHANGELOG.md](/Users/manojkumar/Developer/Littra/chat_engine/backend/CHANGELOG.md).

## 2. Quality gates

- Run:
  - `npm run build`
  - `npm test`
  - `npm run test:coverage`
- Optional DB adapter checks:
  - `TEST_POSTGRES_URL=... npm run test:postgres`
  - `TEST_MONGO_URI=... TEST_MONGO_DB=... npm run test:mongo`

## 3. Package surface

- Confirm public exports in [src/index.ts](/Users/manojkumar/Developer/Littra/chat_engine/backend/src/index.ts).
- Ensure package metadata is correct:
  - `main`, `types`, `exports`, `files` in [package.json](/Users/manojkumar/Developer/Littra/chat_engine/backend/package.json).
- Confirm `README.md` examples still match runtime APIs.

## 4. Publish

- Dry run:
  - `npm pack --dry-run`
- Publish:
  - `npm publish --access public`

## 5. Post-release

- Tag release in VCS.
- Announce version + upgrade notes.
