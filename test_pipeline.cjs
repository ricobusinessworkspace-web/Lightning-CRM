global.window = {
    store: { state: {} },
    api: {},
};
global.document = {
    getElementById: () => ({ style: {} }),
    createElement: () => ({ style: {} }),
    querySelector: () => null,
};
require('./public/ui/pipeline_ui.js');
