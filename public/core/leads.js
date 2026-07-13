window.CoreLeads = {
  getAll: async (filters) => await window.api.getLeads(filters),
  getById: async (id, filters) => {
    let l = null;
    try {
      const leads = await window.api.getLeads(filters); 
      l = leads.find(x => x.id === id);
    } catch (e) {}
    if (!l) {
      const fullList = await window.api.getLeads({ all: true }); 
      l = fullList.find(x => x.id === id);
    }
    return l;
  },
  save: async (leadData) => await window.api.saveLead(leadData),
  delete: async (id) => await window.api.deleteLead(id),
  deleteBulk: async (ids) => await window.api.deleteLeads(ids)
};
