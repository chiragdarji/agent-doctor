# Project Agent

## Backend

### API Layer
Handle all REST endpoints. Use Express middleware for auth.

### Database
Use PostgreSQL. Always use parameterised queries.

#### Migrations
Run with `npm run migrate`. Never edit existing migrations.

#### Seeding
Use `npm run seed` for development data only.

## Frontend

### Components
Use React functional components with hooks only.

### State Management
Use Zustand for global state. Keep local state local.

## Testing

Write tests for all new functions. Aim for 80% coverage.
