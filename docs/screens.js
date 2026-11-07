let current;
export function rowLink(href, title, subtitle = '') {
  const link = document.createElement('a');
  link.href = href;
  link.className = 'screen-row';
  const label = document.createElement('span');
  const strong = document.createElement('strong');
  strong.textContent = title;
  label.append(strong);
  if (subtitle) {
    const note = document.createElement('small');
    note.textContent = subtitle;
    label.append(note);
  }
  const arrow = document.createElement('span');
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden','true');
  link.append(label,arrow);
  return link.outerHTML;
}

// Panels share the original form and event handlers. Each open panel has its own browser history entry.
export function screenMenu(host, sections) {
  const items = sections.filter(item => item.node);
  if (!items.length) return;
  const route = location.hash;
  const menu = document.createElement('div');
  menu.className = 'screen-menu';
  host.prepend(menu);
  function show(key, push = false) {
    const selected = items.find(item => item.key === key);
    if (push && selected && history.state?.flPanel !== key) {
      history.pushState({...history.state, flPanel:key, flPanelRoute:route}, '', location.href);
    }
    menu.hidden = !!selected;
    for (const item of items) item.node.hidden = item !== selected;
    window.scrollTo(0,0);
    if (push) selected?.node.focus({preventScroll:true});
    document.dispatchEvent(new Event('family-screen'));
  }
  for (const item of items) {
    item.node.tabIndex = -1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-row';
    button.append(document.createTextNode(item.label));
    const arrow = document.createElement('span');
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden','true');
    button.append(arrow);
    button.onclick = () => show(item.key, true);
    menu.append(button);
  }
  const api = {route, menu, show, items};
  current = api;
  show(history.state?.flPanelRoute === route ? history.state.flPanel : null);
  return api;
}
export function restorePanel() {
  if (current?.route !== location.hash || !current.menu.isConnected) return;
  current.show(history.state?.flPanelRoute === location.hash ? history.state.flPanel : null);
}
export function activePanel() {
  return current?.menu.isConnected && current.route === location.hash && current.menu.hidden;
}
export function revealInvalid(form, menu) {
  form.addEventListener('invalid', event => {
    if (form.querySelector(':invalid') !== event.target) return;
    const item = menu.items.find(part => part.node.contains(event.target));
    if (item) menu.show(item.key,true);
  },true);
}
