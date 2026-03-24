## Architectural Definition of Done

- [ ] no nuevos writers
- [ ] no nuevos owners
- [ ] no bypass del scheduler
- [ ] no estado fuera de DS
- [ ] no contratos ambiguos
- [ ] tests pasan (runtime + contracts + governance)
- [ ] no uso de APIs legacy

## Runtime validation

- [ ] `npm run test:contracts`
- [ ] `npm run test:governance`
- [ ] `npm run test:runtime`
- [ ] `./validate_repo.sh`

## Notes

- Describe any architectural invariant touched by this PR.
- If a new engine or writer is introduced, the PR is not ready.
