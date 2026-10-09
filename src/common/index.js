const backendDomain = process.env.REACT_APP_BACKEND_URL

const SummaryApi = {
    logIn:{
        url: `${backendDomain}/api/login`,
        method: "post"
    },
    getAdminUsers:{
        url : `${backendDomain}/api/get-admins`,
        method: "get"
    },
    addAdminUser:{
        url : `${backendDomain}/api/add-admins`,
        method: "post"
    },
    getManagerUsers : {
        url : `${backendDomain}/api/get-managers`,
        method: "get"
    },
    addManagerUser: {
        url : `${backendDomain}/api/add-managers`,
        method: "post"
    },
    getBranches: {
        url : `${backendDomain}/api/get-branches`,
        method: "get" 
    },
      addBranch: {
        url : `${backendDomain}/api/add-branches`,
        method: "post" 
    },
    updateUserStatus: {
        url : `${backendDomain}/api/user-status`,
        method: "post"
    },
    getAllLeads: {
        url : `${backendDomain}/api/get-all-leads`,
        method: "get"
    },
    getLead :{
        url: `${backendDomain}/api/get-single-lead`,
        method: "get"
    },
    createLead : {
        url : `${backendDomain}/api/create-Lead`,
        method: "post"
    },
    updateLead: {
        url: `${backendDomain}/api/update-lead`,
        method: "post"
    },
    addRemark: {
        url: `${backendDomain}/api/lead-remarks`,
        method: "post"
    },
    convertToCustomer: {
        url : `${backendDomain}/api/lead-convert`,
        method: "post"
    },
    search : {
        url : `${backendDomain}/api/search`,
        method: "get"
    },
    getAllCustomers : {
        url : `${backendDomain}/api/get-all-customers`,
        method: "get"
    },
    getCustomer: {
        url : `${backendDomain}/api/get-single-customer`,
        method: "get"
    },
    createCustomer :{
        url : `${backendDomain}/api/create-customer`,
        method: "post"
    },
    updateCustomer: {
        url : `${backendDomain}/api/update-customer`,
        method: "post"
    },
    getAllInventoryItems: {
        url : `${backendDomain}/api/get-all-inventory`,
        method: "get"
    },
    getInventoryItemById: {
        url: `${backendDomain}/api/get-single-inventory`,
        method: "get"
    },
    addInventoryItem: {
        url : `${backendDomain}/api/create-inventory`,
        method: "post"
    },
    updateInventoryItem: {
        url : `${backendDomain}/api/update-inventory`,
        method: "post"
    },
    addInventoryStock: {
        url : `${backendDomain}/api/add-stock`,
        method: "post"
    },
    deleteInventoryItem: {
        url : `${backendDomain}/api/delete-inventory`,
        method: "post"
    },
    getInventoryByType: {
        url : `${backendDomain}/api/inventory-by-type`,
        method: "get"
    },
    checkSerialNumber: {
        url: `${backendDomain}/api/check-serial`,
        method: "get"
    },
    getUser: {
        url: `${backendDomain}/api/get-user`,
        method: "get"
      },
      updateUser: {
        url: `${backendDomain}/api/update-user`,
        method: "post"
      },
      deleteUser: {
        url: `${backendDomain}/api/delete-user`,
        method: "delete"
      },
      checkManagerStatus: {
        url : `${backendDomain}/api/manager-status`,
        method: "get"
      },
      getNewBranchManagers: {
        url : `${backendDomain}/api/new-managers`,
        method: "get"
      },
      initiateTransfer: {
        url : `${backendDomain}/api/initiate-transfer`,
        method: "post"
      },
      acceptTransfer: {
        url : `${backendDomain}/api/accept-transfer`,
        method: "post"
      },
      rejectTransfer: {
        url : `${backendDomain}/api/reject-transfer`,
        method: "post"
      },
      getRejectedTransfers: {
        url: `${backendDomain}/api/get-rejected-transfers`,
        method: "get"
      },
      createWorkOrder: {
        url : `${backendDomain}/api/create-work-orders`,
        method: "post"
      },
      getWorkOrders: {
        url: `${backendDomain}/api/get-work-orders`,
        method: "get"
      },
      updateWorkOrderStatus: {
        url : `${backendDomain}/api/update-work-status`,
        method: "post"
      },
      createWorkOrderBill: {
        url : `${backendDomain}/api/create-bill`,
        method: "post"
      },
      confirmWorkOrderBill: {
        url : `${backendDomain}/api/confirm-order-bill`,
        method: "post"
      },
      completeWorkOrder : {
        url : `${backendDomain}/api/complete-work-order`,
        method: "post"
      },
      getWorkOrderDetails: {
        url: `${backendDomain}/api/get-work-order-details`,
        method: "get"
      },
      returnInventoryToManager: {
        url : `${backendDomain}/api/return-inventory`,
        method: "post"
      },
      getTransferHistory: {
        url : `${backendDomain}/api/get-transfer-history`,
        method: "get"
      },
      getManagerProjects: {
        url : `${backendDomain}/api/get-manager-projects`,
        method: "get"
      },
      approveWorkOrder: {
        url : `${backendDomain}/api/approve-order`,
        method: "post"
      },
      getBillDetails:{
        url : `${backendDomain}/api/get-bill-details`,
        method: "get"
      },
      addWorkOrderRemark:{
        url : `${backendDomain}/api/remark-add`,
        method: "post"
      },
      getReturnedInventory: {
        url: `${backendDomain}/api/get-returned-inventory`,
        method: "get"
      },
      confirmReturnedInventory:{
        url : `${backendDomain}/api/confirm-returned-inventory`,
        method: "post"
      },
      getSerialNumberDetails : {
        url: `${backendDomain}/api/serial-number-detail`,
        method: "get"
      },
      updateUsedSerialNumbers: {
        url : `${backendDomain}/api/update-serial-status`,
        method: "post"
      },
      registerWarrantyReplacement : {
        url :  `${backendDomain}/api/register-replacement`,
        method: "post"
      },
      getAllWarrantyReplacements :{
        url : `${backendDomain}/api/get-replacements`,
        method: "get"
      },
      completeWarrantyReplacement : {
        url : `${backendDomain}/api/complete-replacement`,
        method: "post"
      },
      getManagerById: {
        url: `${backendDomain}/api/get-manager-detail`,
        method: "get"
      },
      changePassword: {
        url : `${backendDomain}/api/change-password`,
        method: "post"
      },
      adminChangePassword: {
        url: `${backendDomain}/api/admin-change-password`,
        method: "post"
      },
      getReplacementHistory: {
        url: `${backendDomain}/api/serial-number-history`,
        method: "get"
      },
      checkWarrantyStatus: {
        url: `${backendDomain}/api/check-warranty-status`,
        method: "get"
      },
      findByReplacementSerial: {
         url: `${backendDomain}/api/replaced-serial-number`,
        method: "get"
      },
      updateWarrantyClaim: {
        url : `${backendDomain}/api/warranty-claim`,
        method: "post"
      },
      resetSystem: {
        url: `${backendDomain}/api/reset-system`,
        method: "post"
      }
}

export default SummaryApi;
