When filtering by a lookup column, you often need to use the ID of the related entity. For example:

find the right query below
var query = "?$select=cp_shiftdateandtime&$filter=_cp_admission_value eq " + admissionId;

find the wrong query below
var query = "?$select=cp_shiftdateandtime&$filter=cp_admission eq " + admissionId;

Note:
note that the write way to reference the ID of the related entity is _cp_admission_value and the wrong way is cp_admission


How it its used in the Javascript code:
 // Build the OData query to retrieve shift notes related to this admission.
  // We only need the cp_shiftdateandtime field.
  var query = "?$select=cp_shiftdateandtime&$filter=_cp_admission_value eq " + admissionId;

  // Retrieve the cp_shiftnote records
  Xrm.WebApi.retrieveMultipleRecords("cp_shiftnote", query).then(function (result) {
    var shiftDates = [];
	
	
	
	
	
An alternate method is shown below

    // Query the cp_dailytasks table for records related to the current admission.
    // Adjust the filter syntax if needed based on your environment.
    var fetchXml = `
      <fetch>
        <entity name="cp_dailytasks">
          <attribute name="cp_currentdateandtime" />
          <attribute name="cp_tasks" />
          <filter>
            <condition attribute="cp_admission" operator="eq" value="${admissionId}" />
          </filter>
        </entity>
      </fetch>`;

    // Use the Web API to retrieve the related cp_dailytasks records.
    Xrm.WebApi.retrieveMultipleRecords("cp_dailytasks", "?fetchXml=" + encodeURIComponent(fetchXml))
        .then(function (result) {
            var datetime_task_pairs = [];
            if (result.entities.length > 0) {
                // Build the datetime:task pairs.
                result.entities.forEach(function (rec) {
                    // Convert the datetime string into a Date object.
                    var recordDate = new Date(rec.cp_currentdateandtime);
                    datetime_task_pairs.push({
                        datetime: recordDate,
                        task: rec.cp_tasks
                    });
                });