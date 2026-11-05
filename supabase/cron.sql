-- palsal 예약 작업 — 5분마다 palsal-fetch?mode=run(tick → daily → market 30분마다).
-- 먼저 vault 에 비밀 값 두 개가 있어야 해요: palsal_fetch_url(https://<ref>.supabase.co/functions/v1/palsal-fetch) · palsal_cron_key(함수 PALSAL_CRON_KEY 와 같은 값).
-- 적용: supabase db query --remote --yes -f supabase/cron.sql (다시 돌리면 같은 이름 작업을 바꿔 끼워요)
select cron.unschedule(jobid) from cron.job where jobname in ('palsal-run', 'palsal-tick', 'palsal-daily', 'palsal-market');
select cron.schedule(
  'palsal-run',
  '*/5 * * * *',
  $$ select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_fetch_url') || '?mode=run',
       headers := jsonb_build_object('Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'palsal_cron_key')),
       body := '{}'::jsonb,
       timeout_milliseconds := 140000) $$
);
-- 오래된 cron 기록 · pg_net 응답 정리(하루 한 번, 표가 커지지 않게)
select cron.schedule('palsal-cleanup', '17 3 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  delete from net._http_response where created < now() - interval '1 day';
$$);
