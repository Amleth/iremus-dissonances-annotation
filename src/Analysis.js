export const ANNOTATION_TYPE_PITCHTYPE = 'pitchType';
export const ANNOTATION_TYPE_PITCHSUBTYPE = 'pitchSubType';
export const OFFSET = 'offset';
export const ROOT = 'root';

export const parse = xml => {
    const analysis = {};
    const offsets = {};
    let maxAnalyticalDivisions = 0;

    const pitchCollElements = xml.getElementsByTagName('pitchColl');
    for (let i = 0; i < pitchCollElements.length; i++) {
        const offset = pitchCollElements[i].getAttribute(OFFSET);
        const root = pitchCollElements[i].getAttribute(ROOT);
        offsets[offset] = root;
        const analyzedPitchElements = pitchCollElements[i].getElementsByTagName('analyzedPitch');
        for (let j = 0; j < analyzedPitchElements.length; j++) {
            const id = analyzedPitchElements[j].getAttribute('id');
            const pitchType = analyzedPitchElements[j].getAttribute(ANNOTATION_TYPE_PITCHTYPE);
            const pitchSubType = analyzedPitchElements[j].getAttribute(ANNOTATION_TYPE_PITCHSUBTYPE);
            if (!analysis.hasOwnProperty(id)) analysis[id] = [];
            analysis[id].push({ pitchType, pitchSubType, offset });
            if (analysis[id].length > maxAnalyticalDivisions) maxAnalyticalDivisions = analysis[id].length
        }
    }

    return { analysis, maxAnalyticalDivisions, offsets };
}

export const toXML = (analysisXml, annotationsSource, correctedOffsetsSource) => {
    // Clone XML
    const xml_doc = analysisXml.implementation.createDocument(analysisXml.namespaceURI, null, null);
    xml_doc.appendChild(xml_doc.importNode(analysisXml.documentElement, true));

    // Clone input data
    const annotations = JSON.parse(JSON.stringify(annotationsSource));
    const correctedOffsets = JSON.parse(JSON.stringify(correctedOffsetsSource));

    const pitchCollElements = xml_doc.getElementsByTagName('pitchColl');
    for (const pc of pitchCollElements) {
        if (correctedOffsets[pc.getAttribute('offset')]) pc.setAttribute(ROOT, correctedOffsets[pc.getAttribute('offset')]);
        const analyzedPitchElements = pc.getElementsByTagName('analyzedPitch');
        for (const ap of analyzedPitchElements) {
            const { pitchType, pitchSubType } = annotations[ap.getAttribute('id')].shift();
            if (pitchType) ap.setAttribute(ANNOTATION_TYPE_PITCHTYPE, pitchType);
            if (pitchSubType) ap.setAttribute(ANNOTATION_TYPE_PITCHSUBTYPE, pitchSubType);
        }
    }

    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(xml_doc);
    copyToClipboard(xmlString);
};

const copyToClipboard = str => {
    const el = document.createElement('textarea');
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
};