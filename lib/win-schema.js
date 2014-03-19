//pull in the validating workhorse -- checks schema and stuff
var tv4 = require('tv4');
//pull in traverse object from the repo please!
var traverse = require('optimuslime-traverse');

//pull in the object that knows what all schema look like!
var schemaSpec = require('./schemaSpec');

var addSchemaSupport = require('./addSchema');

module.exports = winSchema;

function winSchema(winback, configuration)
{
	//load up basic win-module stufffff
	var self = this;

  self.pathDelimiter = "///";

  //this creates "internalAddSchema" to handle the weighty add logic
  //need to thoroughly test and modify incoming schema to align with 
  //logical schema setup for WIN
  addSchemaSupport(self);


	self.bb = winback;
  self.log = self.bb.log;

	self.validator = tv4.freshApi();
	self.winFunction = "schema";

  //configuration stuff
  configuration = configuration || {};

  self.multipleErrors = (configuration.multipleErrors == true || configuration.multipleErrors == "true");
  //by default you can have unknown keys -- the server environment may desire to change this
  //if you don't want to be storing extra info
  //by default, on lockdown -- better that way -- no sneaky stuff
  self.allowUnknownKeys = configuration.allowUnknownKeys || false;

  //all keys are required by default -- this adds in required objects for everything
  self.requireByDefault = configuration.requireByDefault || true;

  //do we allow properties with just the type "object" or "array"
  //this would allow ANY data to be fit in there with no validation checks (other than it is an object or array)
  //shouldn't allow this because people could slip in all sorts of terrible things without validation
  self.allowAnyObjects = configuration.allowAnyObjects || false;

  self.eventCallbacks = function()
  {
        var callbacks = {};

        //add callbacks to the object-- these are the functions called when the full event is emitted
        callbacks["schema:validate"] = self.validate;
        callbacks["schema:addSchema"] = self.addSchema;
        callbacks["schema:getSchema"] = self.getSchema;
        callbacks["schema:getSchemaReferences"] = self.getSchemaReferences;
        callbacks["schema:getFullSchema"] = self.getFullSchema;

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
    self.allSchema = {};
    self.schemaReferences = {};
    self.requiredReferences = {};
    self.fullSchema = {};

    self.validTypes = "\\b" + schemaSpec.definitions.simpleTypes.enum.join('\\b|\\b') + "\\b"; //['object', 'array', 'number', 'string', 'boolean', 'null'].join('|');
    self.typeRegExp = new RegExp(self.validTypes);

    self.specKeywords = ["\\$ref|\\b\\wid"];
    for(var key in schemaSpec.properties)
      self.specKeywords.push(key.replace('$', '\\$'));

    //join using exact phrasing checks
    self.specKeywords = self.specKeywords.join('\\b|\\b') + "\\b";
    self.keywordRegExp = new RegExp(self.specKeywords);

    self.log(self.log.testing, "--Specced types: ".green, self.validTypes);
    self.log(self.log.testing, "--Specced keywords: ".green, self.specKeywords);

    self.validateFunction = (self.multipleErrors ? self.validator.validateMultiple : self.validator.validateResult);
    self.errorKey = self.multipleErrors ? "errors" : "error";

    self.validate = function(type, object, finished)
    {
      if(!self.allSchema[type]){
        finished("Schema type not loaded: ", type);
        return;
      }

      //we have to manually detect missing references -- since the validator is not concerned with such things
      //FOR WHATEVER REASON
      var missing = self.validator.getMissingUris();
      for(var i=0; i < missing.length; i++)
      {
        //if we have this type inside our refernces for this object, it means we're missing a ref schema for this type!
        if(self.requiredReferences[type][missing[i]])
        {
          finished("Missing at least 1 schema definition: " + missing[i]);
          return;
        }
      }

      self.log("Validate: ", object);

      //now we need to validate, we definitely have all the refs we need


      var schema = self.validator.getSchema(type);
      self.log('validate against: ', schema);
    	//validate against what type?
    	var result = self.validateFunction(object, self.validator.getSchema(type), true, !self.allowUnknownKeys);

      var errors = result[self.errorKey];

      // self.log('Missing Validation: ', self.validator.getMissingUris());
      // self.log(self.log.testing, "Result: ", result[self.errorKey]);

      //if we have errors during validation, they'll be passed on thank you!
      //if you're valid, and there are no errors, then don't send nuffin
      finished(undefined, result.valid, (errors.length ? errors : undefined));

    }

    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.addSchema = function(type, schemaJSON, finished)
   	{
      //pass args into internal adds
      return self.internalAddSchema.apply(self, arguments);
   	}

   	    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.getSchema = function(type, finished)
   	{
   		if(!self.allSchema[type]){
   			finished("Schema type not loaded: ", type);
   			return;
   		}

   		var schema = self.validator.getSchema(type);

   		//failed to get schema for some very odd reason?
   		if(self.validator.error)
   			finished(self.validator.error);
   		else
   			finished(undefined, schema);
   	}

   	self.getSchemaReferences = function(type, finished)
   	{
		if(!self.allSchema[type]){
   			finished("Schema type not loaded: ", type);
   			return;
   		}

   		//pull reference objects
   		finished(undefined, self.schemaReferences[type]);
   	}

    var buildFullSchema = function(type)
    {
      var schema = self.validator.getSchema(type);
      var tSchema = traverse(schema);

      var clone = tSchema.clone();
      var tClone = traverse(clone);
      var references = self.schemaReferences[type];

      for(var path in references)
      {
        //we get the type of reference
        var refType = references[path];

        //this is recursive behavior -- itwill call buidl full schema if not finished yet
        var fullRefSchema = internalGetFullSchema(refType);

        //now we ahve teh full object to replace
        var tPath = path.split(self.pathDelimiter);

        self.log(self.log.testing, 'Path to ref: ', tPath, " replacement: ", fullRefSchema);

        //use traverse to set the path object as our full ref object
        tClone.set(tPath, fullRefSchema);
      }

      self.log(self.log.testing, "Returning schema: ", type, " full: ", clone);

      return clone;
    }
    var inprogressSchema = {};

    function internalGetFullSchema(type)
    {
      if(inprogressSchema[type])
      {
          throw new Error("Infinite schema reference loop: " + JSON.stringify(Object.keys(inprogressSchema)));    
      }

      inprogressSchema[type] = true;

       //if we don't have a full type yet, we build it
      if(!self.fullSchema[type])
      {
        //need to build a full schema object
        var fSchema = buildFullSchema(type);

        self.fullSchema[type] = fSchema;
      }

      //mark the in progress as false!
      delete inprogressSchema[type];

      return self.fullSchema[type];
    }

    self.getFullSchema = function(type, finished)
    { 
      if(!self.allSchema[type]){
        finished("Schema type not loaded: ", type);
        return;
      }

      try
      {
        //get the full schema from internal function
        //throws error if something is wrong
        var fullSchema = internalGetFullSchema(type);
       
        //pull the full object -- guaranteed to exist
        finished(undefined, self.fullSchema[type]);
      }
      catch(e)
      {
        //send the error if we have one
        finished(e);
      }
    }


	return self;
}



