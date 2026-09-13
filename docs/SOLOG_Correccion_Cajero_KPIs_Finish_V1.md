# Corrección Cajero — KPIs y transición Finish V1

Fuente primaria del delta frontend aprobado tras el smoke humano de Cajero V3.

## Cobertura visual

Durante una sesión activa, la cobertura presentada es `coverage_counted` autoritativo más los grupos únicos con draft normal local que todavía no tengan `cobertura_periodo=true`. Se limita a `groups_total`; los reconteos no aportan cobertura y esta proyección nunca decide `periodComplete`, navegación, cierre ni reglas operativas.

## Stock 0 y Stock negativo

Durante una sesión, el denominador se deriva de todos los grupos congelados de `panel.groups`: `stock_teorico === 0` para Stock 0 y `stock_teorico < 0` para Stock negativo. El numerador combina grupos de ese tipo con `cobertura_periodo=true` y drafts normales únicos aún no cubiertos. Los reconteos no cuentan. Sin sesión, `pre_session_summary.stock_types` continúa siendo autoritativo.

## Finish

Tras un finish confirmado, el panel de sesión se invalida inmediatamente. La UI muestra un estado transitorio de sincronización mientras solicita un bootstrap V3 compacto y luego presenta Inicio pre-sesión. Si ese bootstrap falla, finish permanece confirmado, no se reintenta finish ni se crea otra intención; se permite reintentar únicamente la sincronización. Los estados válidos con `panel_state=null` y `pre_session_summary=null` no deben producir una pantalla blanca ni una excepción.

## Límites

No se modifican Supabase, RPC, Motor V3, contrato Cajero V3, idempotencia, drafts en memoria, recovery V8, Historial V2 ni navegación. Este delta no altera la autoridad backend.
