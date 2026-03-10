

# CompFlow — Implementation Plan

## Overview
CompFlow is an insurance commission tracking and agency hierarchy management SaaS platform. It features a dark-mode-first design with a deep navy (#0F172A) palette, data-dense table layouts, and a complete auth + onboarding flow backed by Supabase.

---

## Phase 1: Design System & Layout Shell

- Set up the CompFlow brand theme: dark mode default with light mode toggle, custom CSS variables for navy (#0F172A), electric blue (#3B82F6), green (#22C55E), red (#EF4444), secondary text (#94A3B8), card backgrounds (#1E293B)
- Add Inter font via Google Fonts
- Create the "CF" monogram logo component
- Build the app shell layout with sidebar navigation (for authenticated pages) and a top navbar (for public pages)

## Phase 2: Public Marketing Landing Page

- **Hero section** with headline "Stop Guessing What Your Team Earns", dual CTAs, and subtle grid pattern background
- **Features section** — 3-column layout covering Hierarchy, Time-Travel Rates, and Multi-Carrier Dashboard
- **How It Works** — 3-step visual walkthrough
- **Social Proof / Stats bar** with animated counters
- **Pricing section** — 3-tier cards (Starter $49, Agency $149, Enterprise custom) with "Most Popular" badge on Agency
- **Footer** with nav links and copyright
- Route logic: unauthenticated users see landing page at `/`, authenticated users redirect to `/dashboard`

## Phase 3: Supabase Database Setup

Create all tables with RLS enabled:

- **tenants** — agency identity
- **agents** — agent profiles linked to tenants and auth users, with upline_email for hierarchy
- **commission_levels** — carrier/product/position rate schedules with effective dates
- **policies** — policy records with writing agent NPN mapping and application date
- **commission_payouts** — calculated commission records per agent per policy
- **webhook_configs** — tenant webhook URLs
- **invites** — invite tokens for agent onboarding
- **user_roles** — role-based access (admin, moderator, user) using security definer function

### RLS & Security
- Tenant isolation on every table
- Recursive `get_downline_agent_ids()` Postgres function for downline-scoped agent visibility
- `has_role()` security definer function for role checks

## Phase 4: Authentication Flow

- **/signup** — Fields: First Name, Last Name, Email, Password, NPN, Agency Name. Creates auth user → tenant → owner agent row → redirects to `/onboarding`
- **/login** — Email + password, redirects to `/dashboard`
- **/forgot-password** — Supabase password reset email flow
- **/reset-password** — New password form handling the recovery token
- **/invite/[token]** — Public invite acceptance page showing agency name and inviter, pre-filled email, creates auth user + agent row, marks invite accepted

## Phase 5: Onboarding Page

- **4-step checklist UI** at `/onboarding`:
  1. Profile complete (name + NPN filled)
  2. Agent Roster imported (≥1 agent)
  3. Commission Levels imported (≥1 row)
  4. Policy Report imported (≥1 row)
- Each step has a button linking to the relevant import modal or settings
- "Go to Dashboard" button appears when all complete (or skip option)

## Phase 6: Core Dashboard Pages (structure only in this phase)

- **/dashboard** — Summary stats: total agents, active policies, total commissions, goal progress
- **/agents** — Data-dense table of agents with hierarchy indicators, search, and filters
- **/commission-levels** — Table view of rate schedules by carrier/product/position
- **/policies** — Table of all policies with status badges, filters by carrier/status/agent
- **/payouts** — Commission payout records with agent and policy detail
- **/settings** — Profile, agency settings, webhook config, invite management

All pages are desktop-first with responsive mobile layouts and use the dark navy theme with data tables as the primary UI pattern.

