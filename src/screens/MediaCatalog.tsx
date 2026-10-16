import { CatalogBrowser, type CatalogBrowserProps } from '../components/CatalogBrowser';

export function MediaCatalog(props: CatalogBrowserProps) {
  return <CatalogBrowser key={props.kind} {...props} />;
}
