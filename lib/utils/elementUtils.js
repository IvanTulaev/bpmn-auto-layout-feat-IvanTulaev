import { is } from '../di/DiUtil.js';

export function isConnection(element) {
  return !!element.sourceRef;
}

export function isBoundaryEvent(element) {
  return !!element.attachedToRef;
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
export function getHostIncoming(element) {
  return (element.incoming || [])
    .map(out => {
      if (!out.sourceRef) throw new Error(`${out.id} has no sourceRef`);
      return out.sourceRef;
    })
    .filter(el => !isBoundaryEvent(el));
}

export function getBoundaryIncomingHosts(element) {
  let boundaryIncoming = (element.incoming || [])
    .map(out => out.sourceRef)
    .filter(el => isBoundaryEvent(el))
    .map(item => item.attachedToRef);
  boundaryIncoming = new Set(boundaryIncoming);

  return [ ...boundaryIncoming ];
}

export function getAttachedOutgoingElements(element) {
  const outgoing = new Set();
  if (element) {
    const attachedOutgoing = (element.attachers || [])
      .sort((a,b) => {
        const bOutCount = b.outgoing ? b.outgoing.length : 0;
        const aOutCount = a.outgoing ? a.outgoing.length : 0;
        return bOutCount - aOutCount;
      })
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

export function bindBoundaryEventsWithHosts(elements) {
  const boundaryEvents = elements.filter(element => isBoundaryEvent(element));
  boundaryEvents.forEach(boundaryEvent => {
    const attachedTask = boundaryEvent.attachedToRef;
    const attachers = attachedTask.attachers || [];
    attachers.push(boundaryEvent);
    attachedTask.attachers = attachers;
  });
}

export function getAllProcesses(bpmnModel) {
  const allElements = bpmnModel.elementsById;
  if (!allElements) return [];
  return Object.values(allElements).filter(element => element.$type === 'bpmn:Process' || element.$type === 'bpmn:SubProcess');
}

/**
 * Set expanded property to element from its diagram
 * @param bpmnModel
 */
export function setExpandedProcesses(bpmnModel) {
  const allElements = bpmnModel.elementsById;
  if (allElements) {
    for (const element of Object.values(allElements)) {
      if (element.$type === 'bpmndi:BPMNShape' && element.isExpanded === true) element.bpmnElement.isExpanded = true;
    }
  }
}