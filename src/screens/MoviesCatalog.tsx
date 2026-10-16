import { CatalogBrowser, type CatalogBrowserProps } from '../components/CatalogBrowser';

export function MoviesCatalog(props: Omit<CatalogBrowserProps, 'kind'>) {
  return <CatalogBrowser {...props} kind="movies" />;
}
