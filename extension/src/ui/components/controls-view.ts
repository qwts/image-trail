export interface ControlsViewCallbacks {
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

export function createControlsView(callbacks: ControlsViewCallbacks): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__actions';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = 'Previous field value';
  previous.addEventListener('click', callbacks.onPrevious);
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next field value';
  next.addEventListener('click', callbacks.onNext);
  wrapper.append(previous, next);
  return wrapper;
}
