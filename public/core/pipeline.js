window.CorePipeline = {
  calculateState: (type, currentE, currentT, currentR) => {
    let e = currentE ? 1 : 0;
    let t = currentT ? 1 : 0;
    let r = currentR ? 1 : 0;

    if (type === 'e') {
       e = e ? 0 : 1;
       if (e === 0) { t = 0; r = 0; }
    }
    if (type === 't') {
       t = t ? 0 : 1;
       if (t) e = 1;
    }
    if (type === 'r') {
       r = r ? 0 : 1;
       if (r) e = 1;
    }
    return { e, t, r };
  }
};
