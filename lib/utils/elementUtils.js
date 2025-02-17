import { is } from '../di/DiUtil.js';

export function isConnection(element) {
  return !!element.sourceRef;
}

export function isBoundaryEvent(element) {
  return !!element.attachedToRef;
}

export function findElementInTree(currentElement, targetElement, reverse, visited = new Set()) {
  if (currentElement === targetElement) return true;

  if (visited.has(currentElement)) return false;

  visited.add(currentElement);

  let currentElementOutgoing = !reverse ? new Set(getOutgoingElements(currentElement).concat(getAttachedOutgoingElements(currentElement))) : new Set(getIncomingElements(currentElement));

  // If currentElement has no outgoing connections, return false
  if (!currentElementOutgoing || currentElementOutgoing.size === 0) return false;

  // Recursively check each outgoing element
  for (let nextElement of currentElementOutgoing) {
    if (findElementInTree(nextElement, targetElement, reverse, visited)) {
      return true;
    }
  }

  return false;
}

export function getOutgoingElements(element) {
  let outgoing = new Set();
  if (element) {
    const selfOutgoing = (element.outgoing || [])
      .map(out => out.targetRef)
      .filter(el => el);
    selfOutgoing.forEach(out => outgoing.add(out));
  }
  return [ ...outgoing ];
}

export function getIncomingElements(element) {
  let incoming = [];

  if (element) {
    incoming = (element.incoming || [])
      .map(out => out.sourceRef)
      .filter(el => el)
      .map(item => {
        if (item.attachedToRef) {
          return item.attachedToRef;
        } else {
          return item;
        }
      });
  }

  // there is no time to check, so here it is
  const unique = new Set(incoming);

  return [ ...unique ];
}

/**
 * Только входящие из хоста
 * @param element
 * @returns {any[]}
 */
export function getHostIncoming (element) {
  return (element.incoming || [])
      .map(out => out.sourceRef)
      .filter(el => !isBoundaryEvent(el))
}

export function getBoundaryIncomingHosts (element) {
  let boundaryIncoming = (element.incoming || [])
      .map(out => out.sourceRef)
      .filter(el => isBoundaryEvent(el))
      .map(item => item.attachedToRef);
  boundaryIncoming = new Set(boundaryIncoming)

  return [...boundaryIncoming]
}


export function getAttachedOutgoingElements(element) {
  const outgoing = new Set();
  if (element) {
    const attachedOutgoing = (element.attachers || [])
      .sort((a,b) => b.outgoing?.length - a.outgoing?.length)
      .map(attacher => (attacher.outgoing || []).reverse())
      .flat()
      .map(out => out.targetRef)
      .filter((item, index, self) => self.indexOf(item) === index);
    for (const out of attachedOutgoing) {
      outgoing.add(out);
    }
  }

  return [ ...outgoing ];
}

export function isStartIntermediate(element) {
  return (is(element, 'bpmn:IntermediateThrowEvent') || is(element, 'bpmn:IntermediateCatchEvent'))
      && (element.incoming === undefined || element.incoming.length === 0);
}

export function bindBoundaryEventsWithHosts (elements) {
  const boundaryEvents = elements.filter(element => isBoundaryEvent(element));
  boundaryEvents.forEach(boundaryEvent => {
    const attachedTask = boundaryEvent.attachedToRef;
    const attachers = attachedTask.attachers || [];
    attachers.push(boundaryEvent);
    attachedTask.attachers = attachers;
  });
}