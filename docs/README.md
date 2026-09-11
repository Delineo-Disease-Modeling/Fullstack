# Delineo documentation

Delineo connects a web application, a population and movement generator, and an
outbreak simulator. Start here when joining the project or returning to it.

| Read | What it answers |
| --- | --- |
| [Project overview](overview.md) | What does Delineo do, and how do the repositories fit together? |
| [Getting started](getting-started.md) | How do I install the public stack and run a small example? |
| [Verification record](verification.md) | Which source revisions and installation steps were checked? |

The first documentation milestone covers orientation and local onboarding. The
synthetic example checks software integration; it does not establish the accuracy
of an epidemiological model. The getting-started guide also identifies the extra
data needed to generate a real convenience zone.

## Repository entry points

- [Fullstack](../README.md): web application, authentication, APIs, and storage.
- [Algorithms](https://github.com/Delineo-Disease-Modeling/Algorithms): zone
  generation, synthetic population, and movement.
- [Simulation](https://github.com/Delineo-Disease-Modeling/Simulation): transmission
  and disease progression, including the Disease Modeling Platform (DMP).

These public repositories are sufficient for the walkthrough. The private Deploy
repository contains maintainer launchers and deployment configuration.

## Keeping these pages current

Update the relevant page in the same change that alters a command, API, data
format, or user workflow. For changes spanning repositories, link the companion
pull requests and update the compatible revisions in the verification record.
Keep each repository's README focused on its own service and link shared setup
instructions here.

Before merging documentation changes, check relative links, run any changed
commands against a disposable database, and record what was actually exercised.
Use the existing code and checked examples to establish current behavior; older
design notes describe historical decisions as well as implemented features.
