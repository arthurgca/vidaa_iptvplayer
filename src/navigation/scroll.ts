export interface ScrollPosition { key: string; top: number; left: number }
export function captureBrowseScroll(): ScrollPosition[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.screen [data-scroll-key]')).map((element) => ({
    key: element.dataset.scrollKey!, top: element.scrollTop, left: element.scrollLeft
  }));
}
export function restoreBrowseScroll(positions?: ScrollPosition[]) {
  if (!positions) return;
  const elements = Array.from(document.querySelectorAll<HTMLElement>('.screen [data-scroll-key]'));
  positions.forEach((position) => {
    const element = elements.find((candidate) => candidate.dataset.scrollKey === position.key);
    if (element) { element.scrollTop = position.top; element.scrollLeft = position.left; }
  });
}
