# Changelog

## [1.1.0](https://github.com/wanpablojob/KFD/compare/mobile-v1.0.0...mobile-v1.1.0) (2026-10-04)


### Features

* **mobile:** replace the Expo scaffold with a customer and rider app ([e1bb3e6](https://github.com/wanpablojob/KFD/commit/e1bb3e6bbddd476f3a9c6ced2e9cac915dd4c578))
* **rider:** delivery-completion push for riders ([2a2bfbc](https://github.com/wanpablojob/KFD/commit/2a2bfbc856cdb0469bb118dfe2603d24d756828f))
* **rider:** earnings from a payout ledger instead of a division ([96ee438](https://github.com/wanpablojob/KFD/commit/96ee4383b149631729628cb1e9f76620aae9a8d2))
* **rider:** let a rider return an undeliverable order (Phase 4.1) ([10db497](https://github.com/wanpablojob/KFD/commit/10db49724cab1fdf1fe3baf91e233902b12d11d9))
* **rider:** let riders apply to deliver, with admin approval ([0edaccb](https://github.com/wanpablojob/KFD/commit/0edaccb865e14486b351d100c1f4c36a6b3864c5))
* **rider:** make the delivery job actionable ([06db67a](https://github.com/wanpablojob/KFD/commit/06db67ab7ddb676401dfa0fab9d7dd4da6df1b94))
* **rider:** show live delivery offers with accept and decline ([e361fee](https://github.com/wanpablojob/KFD/commit/e361fee31eea446a6c192f462c566340076b73aa))


### Bug Fixes

* **dispatch:** unbreak the rider offer/claim chain and its error paths ([7e647f9](https://github.com/wanpablojob/KFD/commit/7e647f9dfcdda8621b2e0db62900d2f3b3dca659))
* **mobile:** pin react-native-worklets so npm ci accepts the lock ([514242c](https://github.com/wanpablojob/KFD/commit/514242c6fa246d7b178a0de51cc0d55a084a67a4))
* **nav:** switch rider and customer tab bars with navigate, not push ([5b7f44c](https://github.com/wanpablojob/KFD/commit/5b7f44c5f7057c3f2be47de01bf8d1baefea1f56))
* **push:** bound the Expo token fetch so the rider toggle cannot hang ([a322e58](https://github.com/wanpablojob/KFD/commit/a322e5867f7f6e7b45943b180df6f72b17e3dd4b))
* **rider:** derive offer expiry copy, let rejected applicants reapply ([ff1f7d3](https://github.com/wanpablojob/KFD/commit/ff1f7d32b33849e458f1466b075c2f56d05806fe))
* **rider:** stop deliveries emptying when switching rider tabs ([d079b46](https://github.com/wanpablojob/KFD/commit/d079b46b757d1a56836c702027d2630ca37f693e))
* **rider:** stop the deliveries spinner from hanging on a failed load ([1516bdb](https://github.com/wanpablojob/KFD/commit/1516bdb103045c902bcfbc1f02761cd3908b2fe2))
