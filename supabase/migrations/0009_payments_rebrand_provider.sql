-- 0009_payments_rebrand_provider.sql
-- One-shot data migration: after switching the payment gateway from
-- Paystack to Moolre, rewrite the legacy provider label on existing
-- rows so the UI doesn't surface "paystack" anywhere. The underlying
-- transactions are historically Paystack's, but for product purposes
-- we treat them as part of the Moolre ledger going forward.
--
-- Safe to re-run: the WHERE clause makes it a no-op after the first run.

update payments
set provider = 'moolre'
where provider = 'paystack';
