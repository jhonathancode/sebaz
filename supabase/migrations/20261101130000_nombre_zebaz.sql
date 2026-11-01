-- El sistema pasa a llamarse ZEBAZ: se actualizan los textos guardados de la web pública
update web_ajustes set nombre_sitio = 'Zebaz' where nombre_sitio = 'Sebaz';
update blog_categorias set nombre = 'Novedades de Zebaz' where nombre = 'Novedades de Sebaz';
