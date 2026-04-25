# uniflow

next.js app for a university platform, built with supabase + shadcn/radix ui + tailwind.

## what it does

- auth flows: register / login / forgot + reset password
- role-based dashboards: student, profesor, admin, audit
- courses: listing + course pages, materials, assignments, submissions
- admin tools: roles, inventory/resources, stats, email outbox sender
- audit logging (page views) via api route

## dev

```bash
npm install
npm run dev
```

## build

```bash
npm run build
npm run start
```

## notes

- uses supabase (see `utils/supabase/` and `sql/` for schema/policies)
- env is required (supabase url + anon key; plus smtp or mailersend if using email outbox)