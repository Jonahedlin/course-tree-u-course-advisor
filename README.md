# Course Tree (u-course advisor)

The U-Course Advisor course tree as a standalone app: a collapsible,
force-directed chart of a student's completed courses linked to their
prerequisites. Copied from the U-Course Advisor frontend (`my-app`).

## How it works

All data comes from the existing U-Course Advisor backend API. This app never
touches the database. Requests carry an Auth0 access token for the audience
`https://unbc-advisor-api` (hard-coded in `src/lib/api.ts`).

| Endpoint | Used for |
|---|---|
| `POST /users/register` | creates the backend user on first login (`AuthGate`) |
| `GET /courses/{id}` | prerequisite groups for each node |
| `GET /courses/search?q=` | search bar |
| `GET /courses?department=DUNE` | DUNE easter egg |
| `GET /profile` | enrolment year, for the semester picker |
| `GET/POST/DELETE /profile/completed-courses` | the student's completed courses |

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in the Auth0 values
npm run dev                        # http://localhost:5173
```

In development, Vite proxies `/api` to the Railway backend (`vite.config.ts`).
In production, the backend's `ALLOWED_ORIGINS` must include this app's origin,
and the Auth0 application must list it under Allowed Callback, Logout and Web
Origins URLs.

## Structure

```
src/
├── App.tsx                         Auth0 + router; every route lands on the tree
├── Components/CourseTree.tsx       the amCharts ForceDirected chart
├── Pages/CourseSelection.tsx       data loading, search, add / edit / remove
├── Pages/LoginPage.tsx             shown by AuthGate when logged out
├── auth/                           Auth0ProviderWithConfig, AuthGate
├── context/PreferencesContext.tsx  DUNE easter-egg unlock state
├── lib/                            api, enrollment (terms), menuAnimation, utils
└── index.css                       Tailwind + the --brand accent colour
```

## Changes from the original

- Removing a course that another course still needs keeps it as a grey
  prerequisite node, and grey nodes nothing links to are cleaned up.
- The tree's "Continue" button and the post-login redirect point at pages that
  don't exist here, so they fall back to the tree.
