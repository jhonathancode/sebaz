/** Muestra ?ok= o ?error= que dejan las acciones al volver. */
export default function Avisos({ ok, error }: { ok?: string; error?: string }) {
  return (
    <>
      {ok && (
        <div className="aviso ok" role="status">
          {ok}
        </div>
      )}
      {error && (
        <div className="aviso error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

export type ParamsAviso = Promise<{ ok?: string; error?: string; [k: string]: string | undefined }>;
