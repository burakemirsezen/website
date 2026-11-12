# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro (static output), built into its own container image and served by nginx.
The user chose "framework with its own image". This repository builds the
image in CI; the home-infra repository references it by tag.

## Users

Mostly recruiters and hiring engineers evaluating Burak for internships and
software jobs. Also a general audience: fellow students, VIS people, and
open-source maintainers who arrive from GitHub or LinkedIn.

## Product Purpose

The personal website of Burak Emir Sezen at `bsezen.com`. It says who he is,
what he has built and runs, and how to reach him. Success: a hiring visitor
understands his work within a minute and follows a link to GitHub, LinkedIn,
or email.

## Positioning

A computer science student at ETH Zurich who both builds software and operates
it: production platforms at VIS, LLM deployment tooling on GPU clusters, and a
home Kubernetes cluster that serves this very site.

## Operating Context

Served from a two-node home K3s cluster (Proxmox, Argo CD, Tanka), reached
through a Cloudflare tunnel. Deployed by GitOps: a merge to `main` of
home-infra deploys.

## Capabilities and Constraints

- Single page, static, no backend.
- No phone number and no CV PDF on the site.
- Contact is a dedicated mailbox that does not exist yet (open decision: the
  address; `hello@bsezen.com` is a placeholder), plus GitHub and LinkedIn.

## Evidence on Hand

- CV (`Burak_Emir_Sezen_CV_SWE.pdf`, on the user's Desktop, not in the repo):
  education, VIS, Swiss AI, teaching, bachelor's thesis, open-source
  contributions, skills, spoken languages.
- The home-infra repository itself (cluster layout, app list).
- No photo, logo, testimonials, or metrics beyond those in the CV. Do not
  invent any.

## Product Principles

- Every claim comes from the CV or the repository.
- Hiring visitors first, without turning the page into a sales pitch.
- Private details stay private.
