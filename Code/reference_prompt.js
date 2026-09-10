note that i am using logical names of tables and columns in this prompt.
i have an admission table named 'cp_cp_admission' and a shift note table named 'cp_shiftnote'. 
please find the relevant columns of the tables delimited by three columns (:::) below and the prompt for javascript code delimited by three dashes (---)

:::
cp_shiftnote columns
cp_shiftdateandtime - (this is a datetime datatype and it is the date and time the note was recorded)
cp_admission - (this is a lookup to the cp_cp_admission table).
cp_shiftnoteid (this is the unique identifier for each record in cp_shiftnote).

cp_cp_admission columns
cp_daynotescompleted (this is a choice column and will have the value "Yes" if the date portion of 'most_recent_datetime' is equal to the date portion of 'current_datetime and the time portion of current_datetime is between 7:00 a.m. – 7:00 p.m).
cp_nightnotescompleted (this is a choice column and will have the value "Yes" if the date portion of 'most_recent_datetime' is equal to the date portion of 'current_datetime and the time portion of current_datetime is between 7:00 p.m. – 7:00 a.m).
cp_cp_admissionid - (this is the unique identifier for each record in cp_cp_admission).

cp_daynotescompleted and cp_nightnotescompleted are both choice data type fields with option set (Label: "Yes", Value: 121570000) and (Label: "No", Value: 121570001)
:::

---
create a javascript web resource that collects all records from the table cp_shiftnote that are related to the current admission. 
save the values in cp_shiftdateandtime for the collected records in an array.
find the max value of this array (that is, the most recent datetime) and save it in a variable 'most_recent_datetime'
note the current system date and time e.g today() and now() and save it in 'current_datetime'

if the date portion of 'most_recent_datetime' is equal to the date portion of 'current_datetime and the time portion of current_datetime is between 7:00 a.m. – 7:00 p.m.
		write the value "Yes" to the field cp_daynotescompleted of the related admission record
		
if the date portion of 'most_recent_datetime' is equal to the date portion of 'current_datetime and the time portion of current_datetime is between 7:00 p.m. – 7:00 a.m.
		write the value "Yes" to the field cp_nightnotescompleted of the related admission record
		
if the date portion of 'most_recent_datetime' is equal to the {(date portion of 'current_datetime') - 1} (if the day is yesterday then check if this is a night shift that started 7pm yesterday and it is currently past midnight) and the time portion of current_datetime is between 7:00 p.m. – 7:00 a.m.
	write the value "Yes" to the field cp_nightnotescompleted of the related admission record
	
if all the conditions above are false, leave the fields at the current value i.e. do nothing
---
