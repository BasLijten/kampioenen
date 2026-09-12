# Kampioenen Deployment Context

This context defines the deployment language for the three Vercel projects that publish club-specific instances of the Kampioenen site.

## Language

**Vercel Project**:
A deployment target that publishes one club-specific instance of the Kampioenen site.
_Avoid_: app, site

**Application build**:
The phase that turns a repository revision into deployable site output.
_Avoid_: deployment, release

**Ignore Build Step**:
A Vercel decision gate that determines whether the application build runs for a repository revision.
_Avoid_: deployment skip, deploy suppression

**Documentation-only change**:
A revision whose changed paths are limited to the repository's approved documentation and agent-skill paths.
_Avoid_: non-code change

**Normal-build change**:
A revision with at least one changed path outside the documentation-only allowlist, so the application build must run.
_Avoid_: code change

**Preview**:
A non-production deployment associated with a branch or pull request.
_Avoid_: staging deployment

**Production**:
The live deployment environment associated with the repository's production branch.
_Avoid_: live preview
