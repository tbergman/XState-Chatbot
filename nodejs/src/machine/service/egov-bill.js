const config = require('../../env-variables');
const fetch = require("node-fetch");
const moment = require("moment-timezone");
class BillService {

  constructor() {
    this.services = [];
    let supportedModules = config.billSupportedModules.split(',');
    for(let module of supportedModules) {
      this.services.push(module.trim());
    }
  }

  getSupportedServicesAndMessageBundle() {
    let services = this.services;
    let messageBundle = {
      WS: {
        en_IN: 'Water and Sewerage Bill'
      },
      PT: {
        en_IN: 'Property Tax'
      },
      TL: {
        en_IN: 'Trade License Fees'
      },
      FIRENOC: {
        en_IN: 'Fire NOC Fees'
      },
      BPA: {
        en_IN: 'Building Plan Scrutiny Fees'
      }
    }
    
    return { services, messageBundle };
  }

  getSearchOptionsAndMessageBundleForService(service) {
    let messageBundle = {
      mobile: {
        en_IN: 'Search 🔎 using Mobile No.📱'
      },
      connectionNumber: {
        en_IN: 'Search 🔎 using Connection No.'
      },
      consumerNumber: {
        en_IN: 'Search 🔎 using Consumer Number'
      },
      propertyId: {
        en_IN: 'Search 🔎 using Property ID'
      },
      tlApplicationNumber: {
        en_IN: 'Search 🔎 using Trade License Application Number'
      },
      nocApplicationNumber: {
        en_IN: 'Search 🔎 using NOC Application Number'
      },
      bpaApplicationNumber: {
        en_IN: 'Search 🔎 using BPA Application Number'
      }
    }
    let searchOptions = [];
    if(service === 'WS') {
      searchOptions = [ 'mobile', 'connectionNumber', 'consumerNumber' ];
    } else if(service === 'PT') {
      searchOptions = [ 'mobile', 'propertyId', 'consumerNumber' ];
    } else if(service === 'TL') {
      searchOptions = [ 'mobile', 'tlApplicationNumber' ];
    } else if(service === 'FIRENOC') {
      searchOptions = [ 'mobile', 'nocApplicationNumber' ];
    } else if(service === 'BPA') {
      searchOptions = [ 'mobile', 'bpaApplicationNumber' ];
    }

    return { searchOptions, messageBundle };
  }

  getOptionAndExampleMessageBundle(service, searchParamOption) {
    let option = {
      en_IN: 'Mobile Number'
    };
    let example = {
      en_IN: 'Do not use +91 or 0 before mobile number.'
    }
    return { option, example };
  }

  validateParamInput(service, searchParamOption, paramInput) {
    var state=config.rootTenantId;
    state=state.toUpperCase();

    if(searchParamOption === 'mobile') {
      let regexp = new RegExp('^[0-9]{10}$');
      return regexp.test(paramInput);
    }

    if(searchParamOption === 'consumerNumber' || searchParamOption === 'propertyId' || searchParamOption === 'connectionNumber'){
        if(service === 'PT'){
          let regexp = new RegExp(state+'-PT-\\d{4}-\\d{2}-\\d{2}-\\d+$');
          return regexp.test(paramInput);
        }
        if(service === 'WS'){
          //todo
          let regexp = new RegExp('WS/\\d{3}/\\d{4}-\\d{2}/\\d+$');
          return regexp.test(paramInput);
        }
    }
    

    if(searchParamOption === 'tlApplicationNumber'){
        let regexp = new RegExp(state+'-TL-\\d{4}-\\d{2}-\\d{2}-\\d+$');
        return regexp.test(paramInput);
    }

    if(searchParamOption === 'nocApplicationNumber'){
      let regexp = new RegExp(state+'-FN-\\d{4}-\\d{2}-\\d{2}-\\d+$');
      return regexp.test(paramInput);
    }

    if(searchParamOption === 'bpaApplicationNumber'){
      let regexp = new RegExp(state+'-BP-\\d{4}-\\d{2}-\\d{2}-\\d+$');
      return regexp.test(paramInput);
    }
    return true;
  }


  async prepareBillResult(responseBody){
    let results=responseBody.Bill;
    let billLimit = config.billSearchLimit;

    if(results.length < billLimit)
      billLimit = results.length;

    var Bills = {};
    Bills['Bills'] = [];
    var count =0;

    let self = this;
    for(let result of results){
      if(result.status=='ACTIVE' && result.totalAmount!=0 && count<billLimit){
        let dueDate = moment(result.billDetails[result.billDetails.length-1].expiryDate).tz(config.timeZone).format(config.dateFormat);
        let fromMonth = new Date(result.billDetails[result.billDetails.length-1].fromPeriod).toLocaleString('en-IN', { month: 'short' });
        let toMonth = new Date(result.billDetails[result.billDetails.length-1].toPeriod).toLocaleDateString('en-IN', { month: 'short' });
        let fromBillYear = new Date(result.billDetails[result.billDetails.length-1].fromPeriod).getFullYear();
        let toBillYear = new Date(result.billDetails[result.billDetails.length-1].toPeriod).getFullYear();
        let billPeriod = fromMonth+" "+fromBillYear+"-"+toMonth+" "+toBillYear;
        let tenantId= result.tenantId;
        let link = await self.getPaymentLink(result.consumerCode,tenantId,result.businessService);
        
        var data={
          service: result.businessService,
          id: result.consumerCode,
          secondaryInfo: 'Ajit Nagar,  Phagwara', //to do
          dueAmount: result.totalAmount,
          dueDate: dueDate,
          period: billPeriod,
          paymentLink: link
        }
        Bills['Bills'].push(data);
        count = count + 1;
      } 
  }

  return Bills['Bills'];  
  }

  async fetchBillsForUser(user, locale) {

    let requestBody = {
      RequestInfo: {
        authToken: user.authToken
      }
    };

    let billUrl = config.billServiceHost + config.billServiceSearchPath + '?tenantId=pb.amritsar';


    if(user.hasOwnProperty('paramOption') && (user.paramOption!=null) ){
      billUrl+='&';
      if(user.paramOption=='mobile')
        billUrl +='mobileNumber='+user.paramInput;
      if(user.paramOption=='consumerNumber' || user.paramOption == 'tlApplicationNumber' || user.paramOption == 'nocApplicationNumber'
      || user.paramOption=='bpaApplicationNumber' || user.paramOption=='connectionNumber' || user.paramOption=='propertyId')
        billUrl +='consumerCode='+user.paramInput;
      else
        billUrl +=user.paramOption+'='+user.paramInput;
      
      billUrl+='&';
      billUrl +='service='+user.service;
    }
    else{
      billUrl+='&';
      billUrl +='mobileNumber='+user.mobileNumber;
    }

    let options = {
      method: 'POST',
      origin: '*',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }
    
    let response = await fetch(billUrl, options);
    let results,totalBillSize,pendingBillSize;
    if(response.status === 200) {
      let responseBody = await response.json();
      results=await this.prepareBillResult(responseBody);
      totalBillSize=responseBody.Bill.length;
      pendingBillSize=results.length;
      
    } else {
      console.error('Error in fetching the bill');
      return undefined;
    }

    if(totalBillSize==0){
      return {                        
        totalBills: 0,             // mobile number not linked with any bills
        pendingBills: undefined
      }
    }
    else if(pendingBillSize==0){
      return {
        totalBills: 2,              // No pending, but previous bills do exist
        pendingBills: undefined     // This is so that user doesn't get message saying 'your mobile number is not linked', but rather a message saying 'No pending dues'
      } 
    }
    else{
      return {
        pendingBills: results,      // Pending bills exist
        totalBills: pendingBillSize
      }
    }


  }

  async fetchBillsForParam(user, service, paramOption, paramInput) {
      //console.log(`Received params: ${JSON.stringify(user)}, ${JSON.stringify(service)}, ${paramOption}, ${JSON.stringify(paramInput)}`);
      user.service=service;
      user.paramOption=paramOption;
      user.paramInput=paramInput;
      let billsForUser = await this.fetchBillsForUser(user);
      return billsForUser.pendingBills;
  }
  
  async getShortenedURL(finalPath)
{
  var urlshortnerHost = config.UrlShortnerHost;
  var url = urlshortnerHost + '/egov-url-shortening/shortener';
  var request = {};
  request.url = finalPath; 
  var options = {
    method: 'POST',
    body: JSON.stringify(request),
    headers: {
      'Content-Type': 'application/json'
    }
  }
  let response = await fetch(url, options);
  let data = await response.text();
  return data;
}

  async getPaymentLink(consumerCode,tenantId,businessService)
  {
    var UIHost = config.externalHost;
    var paymentPath = config.msgpaylink;
    paymentPath=paymentPath.replace(/\$consumercode/g,consumerCode);
    paymentPath=paymentPath.replace(/\$tenantId/g,tenantId);
    paymentPath=paymentPath.replace(/\$businessservice/g,businessService);
    var finalPath = UIHost + paymentPath;
    var link = await this.getShortenedURL(finalPath);
    return link;
  }

}
module.exports = new BillService();