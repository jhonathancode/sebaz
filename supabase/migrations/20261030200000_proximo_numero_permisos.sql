-- =====================================================================
-- La función del número que le toca al próximo documento debe poder llamarla
-- cualquier usuario con sesión, y la API debe verla enseguida.
-- =====================================================================
revoke execute on function proximo_numero(uuid, text, int) from public, anon;
grant execute on function proximo_numero(uuid, text, int) to authenticated;
notify pgrst, 'reload schema';
