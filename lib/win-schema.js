//pull in the validating workhorse -- checks schema and stuff
var tv4 = require('tv4');

module.exports = winSchema;

function winSchema(winback, configuration)
{
	//load up basic win-module stufffff
	var self = this;

	self.bb = winback;

	self.validator = tv4.freshApi();

	self.winFunction = "schema";

    self.eventCallbacks = function()
    {
        var callbacks = {};

        //add callbacks to the object-- these are the functions called when the full event is emitted
        callbacks["schema:addSchema"] = self.addSchema;
        callbacks["schema:getSchema"] = self.getSchema;
        callbacks["schema:getSchemaReferences"] = self.getSchemaReferences;

        //send back our callbacks
        return callbacks;
    }
    self.requiredEvents = function()
    {
    	//don't need no one for nuffin'
    	return [];
    }

    self.initialize = function(done)
    {
    	setTimeout(function()
    	{
    		done();
    	}, 0);
    }

    //cache all our schema by type
    var allSchema = {};

    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.addSchema = function(type, schemaJSON, finished)
   	{
   		allSchema[type] = schemaJSON;

   		if(!schemaJSON.id || schemaJSON.id != type)
   			schemaJSON.id = type;

   		self.validator.addSchema(schemaJSON);

   		var map  = self.validator.getSchemaMap();
   		console.log("Schema map: " , map);

   		//failed to add schema for some reason?
   		if(self.validator.error)
   			finished(self.validator.error);
   		else
   			finished();
   	}

   	    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.getSchema = function(type, finished)
   	{
   		if(!allSchema[type])
   			finished("Schema type not loaded: ", type);

   		var schema = self.validator.getSchema(finished);

   		//failed to get schema for some very odd reason?
   		if(self.validator.error)
   			finished(self.validator.error);
   		else
   			finished(undefined, schema);
   	}

   	self.getSchemaReferences = function(type, finished)
   	{
   		finished("not yet implemented");
   	}

	return self;
}



