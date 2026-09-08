-- Welche Spalten verweisen auf Nutzer — und mit welchem Datentyp?
-- Das Ergebnis bitte einmal zurückgeben, bevor gelöscht wird.
SELECT c.table_name,
       c.column_name,
       c.data_type,
       c.udt_name,
       c.is_nullable,
       (SELECT count(*)
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_name  = c.table_name
           AND kcu.column_name = c.column_name
       ) AS hat_foreign_key
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.column_name IN ('claimed_by','by_user_id','by_user_name','user_id','owner_id','id')
   AND c.table_name IN (
     'crm_leads','crm_calls','lead_activities','crm_notifications',
     'crm_push_subscriptions','user_profiles','crm_projects','crm_project_tasks'
   )
 ORDER BY c.table_name, c.column_name;
