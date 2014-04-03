//pull in the validating workhorse -- checks schema and stuff
var tv4 = require('tv4');
//pull in traverse object from the repo please!
var traverse = require('optimuslime-traverse');

//pull in the object that knows what all schema look like!
var schemaSpec = require('./schemaSpec.js');

var addSchemaSupport = require('./addSchema');

module.exports = winSchema;

function winSchema(winback, globalConfiguration, localConfiguration)
{
	//load up basic win-module stufffff
	var self = this;
  self.winFunction = "schema";
  self.log = winback.getLogger(self);

  //limited only by global -- or we could limit our own verboseness
  self.log.logLevel = localConfiguration.logLevel || self.log.normal;

  self.pathDelimiter = "///";

  //this creates "internalAddSchema" to handle the weighty add logic
  //need to thoroughly test and modify incoming schema to align with 
  //logical schema setup for WIN
  addSchemaSupport(self, globalConfiguration, localConfiguration);

	self.validator = tv4.freshApi();

 //set the backbone and our logging function
  self.bbEmit = winback.getEmitter(self);

  //config setups

  self.multipleErrors = (localConfiguration.multipleErrors == true || localConfiguration.multipleErrors == "true");
  //by default you can have unknown keys -- the server environment may desire to change this
  //if you don't want to be storing extra info
  //by default, on lockdown -- better that way -- no sneaky stuff
  self.allowUnknownKeys = localConfiguration.allowUnknownKeys || false;

  //all keys are required by default -- this adds in required objects for everything
  self.requireByDefault = localConfiguration.requireByDefault || true;

  //do we allow properties with just the type "object" or "array"
  //this would allow ANY data to be fit in there with no validation checks (other than it is an object or array)
  //shouldn't allow this because people could slip in all sorts of terrible things without validation
  self.allowAnyObjects = localConfiguration.allowAnyObjects || false;

  self.eventCallbacks = function()
  {
        var callbacks = {};

        //add callbacks to the object-- these are the functions called when the full event is emitted
        callbacks["schema:validate"] = self.validateData;
        callbacks["schema:validateMany"] = self.validateDataArray;
        callbacks["schema:addSchema"] = self.addSchema;
        callbacks["schema:getSchema"] = self.getSchema;
        callbacks["schema:getSchemaReferences"] = self.getSchemaReferences;
        callbacks["schema:getFullSchema"] = self.getFullSchema;
        callbacks["schema:getSchemaProperties"] = self.getSchemaProperties;

        //these are for deealing with pulling references from a specific object -- it's easier done in this module
        callbacks["schema:getReferencesAndParents"] = self.getReferencesAndParents;
        callbacks["schema:replaceParentReferences"] = self.replaceParentReferences;

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
    self.primaryPaths = {};
    self.typeProperties = {};

    self.validTypes = "\\b" + schemaSpec.definitions.simpleTypes.enum.join('\\b|\\b') + "\\b"; //['object', 'array', 'number', 'string', 'boolean', 'null'].join('|');
    self.typeRegExp = new RegExp(self.validTypes);

    self.specKeywords = ["\\$ref|\\babcdefg"];
    for(var key in schemaSpec.properties)
      self.specKeywords.push(key.replace('$', '\\$'));

    //join using exact phrasing checks
    self.specKeywords = self.specKeywords.join('\\b|\\b') + "\\b";
    self.keywordRegExp = new RegExp(self.specKeywords);

    self.log(self.log.testing, "--Specced types: ".green, self.validTypes);
    self.log(self.log.testing, "--Specced keywords: ".green, self.specKeywords);

    self.validateFunction = (self.multipleErrors ? self.validator.validateMultiple : self.validator.validateResult);
    self.errorKey = self.multipleErrors ? "errors" : "error";

    function listTypeIssues(type)
    {
      if(!self.allSchema[type]){
        return "Schema type not loaded: " + type;
      }

      //we have to manually detect missing references -- since the validator is not concerned with such things
      //FOR WHATEVER REASON
      var missing = self.validator.getMissingUris();
      for(var i=0; i < missing.length; i++)
      {
        //if we have this type inside our refernces for this object, it means we're missing a ref schema for this type!
        if(self.requiredReferences[type][missing[i]])
        {
          return "Missing at least 1 schema definition: " + missing[i];
        }
      }
    }

    function internalValidate(schema, object)
    {
      //validate against what type?
      var result = self.validateFunction.apply(self.validator, [object, schema, true, !self.allowUnknownKeys]);

       //if it's not an array, make it an array
      //if it's empty, make it a damn array
      var errors = result[self.errorKey];

      //if you are multiple errors, then you are a non-undefined array, just return as usual
      //otherwise, you are an error but not in an array
      //if errors is undefined then this will deefault to []
      errors = (errors && !Array.isArray(errors)) ? [errors] : errors || [];

      return {valid : result.valid, errors : errors};
    }
    self.validateDataArray = function(type, objects, finished)
    {
      var typeIssues = listTypeIssues(type);

      //stop if we have type issues
      if(typeIssues)
      {
        finished(typeIssues);
        return;
      }
      else if(typeof type != "string" || !Array.isArray(objects))
      {
        finished("ValidateMany requires type [string], objects [array]");
        return;
      }

      var schema = self.validator.getSchema(type);
      // self.log('validate many against: ', schema);

      var allValid = true;
      var allErrors = [];
      for(var i=0; i < objects.length; i++)
      {
        var result = internalValidate(schema, objects[i]);

        if(!result.valid){
          allValid = false;
          allErrors.push(result.errors);
        }
        else //no error? just push empty array!
          allErrors.push([]);
      }

      //if we have errors during validation, they'll be passed on thank you!
      //if you're valid, and there are no errors, then don't send nuffin
      finished(undefined, allValid, (!allValid ? allErrors : undefined));
    }
    self.validateData = function(type, object, finished)
    {
      var typeIssues = listTypeIssues(type);

      //stop if we have type issues
      if(typeIssues)
      {
        finished(typeIssues);
        return;
      }

      //log object being checked
      self.log("Validate: ", object);

      //now we need to validate, we definitely have all the refs we need
      var schema = self.validator.getSchema(type);

      //log what's being validated
      self.log('validate against: ', schema);
    	 
      var result = internalValidate(schema, object);

      //if we have errors during validation, they'll be passed on thank you!
      //if you're valid, and there are no errors, then don't send nuffin
      finished(undefined, result.valid, (result.errors.length ? result.errors : undefined));
    }

    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.addSchema = function(type, schemaJSON, options, finished)
   	{
      //pass args into internal adds
      return self.internalAddSchema.apply(self, arguments);
   	}

   	    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.getSchema = function(typeOrArray, finished)
   	{   	
      //did we request one or many?
      var typeArray = typeOrArray;
      if(typeof typeOrArray == "string")
      {
        //make single type to return
        typeArray = [typeOrArray];
      }

      var refArray = [];
      for(var i=0; i < typeArray.length; i++)
      {
        var sType = typeArray[i];

      //failed to get schema for some very odd reason?
        if(!self.allSchema[sType]){
          finished("Schema type not loaded: ", sType);
          return;
        }
        //push our reference information as a clone
        refArray.push(traverse(self.validator.getSchema(sType)).clone());
        //if you hit an error -send back
        if(self.validator.error){
          finished(self.validator.error);
          return;
        }
      }

      //send the schema objects back
      //send an array regardless of how many requested -- standard behavior
      finished(undefined, refArray);    

   	}

   	self.getSchemaReferences = function(typeOrArray, finished)
   	{
      var typeArray = typeOrArray;
      if(typeof typeOrArray == "string")
      {
        //make single type to return
        typeArray = [typeOrArray];
      }

      var refArray = [];
      for(var i=0; i < typeArray.length; i++)
      {
        var sType = typeArray[i];

        if(!self.allSchema[sType]){
          finished("Schema type not loaded: ", sType);
          return;
        }
        //push our reference information as a clone
        refArray.push(traverse(self.requiredReferences[sType]).clone());
      }

  		//send the refernece objects back
      //if you are a single object, just send the one -- otherwise send an array
      finished(undefined, refArray); 		
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
        var schemaInfo = references[path];
        var refType = schemaInfo.schemaType;

        //this is recursive behavior -- itwill call buidl full schema if not finished yet
        var fullRefSchema = internalGetFullSchema(refType);

        if(!fullRefSchema)
          throw new Error("No schema could be created for: " + refType + ". Please check it's defined.");

        //now we ahve teh full object to replace
        var tPath = path.split(self.pathDelimiter);

        // self.log(self.log.testing, 'Path to ref: ', tPath, " replacement: ", fullRefSchema);

        //use traverse to set the path object as our full ref object
        tClone.set(tPath, fullRefSchema);
      }

      // self.log(self.log.testing, "Returning schema: ", type, " full: ", clone);

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

    self.getFullSchema = function(typeOrArray, finished)
    { 
      var typeArray = typeOrArray;
      if(typeof typeOrArray == "string")
      {
        //make single type to return
        typeArray = [typeOrArray];
      }

      var fullArray = [];
      for(var i=0; i < typeArray.length; i++)
      {
        var sType = typeArray[i];

         if(!self.allSchema[sType]){
          finished("Schema type not loaded: ", sType);
          return;
        }

        try
        {
          //get the full schema from internal function
          //throws error if something is wrong
          var fullSchema = internalGetFullSchema(sType);
         
          //pull the full object -- guaranteed to exist -- send a clone
           fullArray.push(traverse(fullSchema).clone());
        }
        catch(e)
        {
          //send the error if we have one
          finished(e);
          return;
        }
      }

      //send the refernece objects back
      //if you are a single object, just send the one -- otherwise send an array
      finished(undefined, fullArray);
    }

    self.getSchemaProperties = function(typeOrArray, finished)
    {
       var typeArray = typeOrArray;
      if(typeof typeOrArray == "string")
      {
        //make single type to return
        typeArray = [typeOrArray];
      }

      var propArray = [];
      for(var i=0; i < typeArray.length; i++)
      {
        var sType = typeArray[i];

         if(!self.allSchema[sType]){
          finished("Schema type not loaded: ", sType);
          return;
        }

        //get our schema properties
        propArray.push({type: sType, primaryPaths: traverse(self.primaryPaths[sType]).clone(), properties: traverse(self.typeProperties[sType]).clone()});

      }


      //send the refernece objects back
      //if you are a single object, just send the one -- otherwise send an array
      finished(undefined, propArray);
    }

    //we're going to clone the object, then replace all of the reference wids with new an improved parents
    self.replaceParentReferences = function(type, object, parentMapping, finished)
    {
      var tClone = traverse(object).clone();

      traverse(tClone).forEach(function(node)
      {
         //if we have a wid object and parents object -- likely we are a tracked reference
        if(this.node.wid && this.node.parents)
        {
          var replaceParents = parentMapping[this.node.wid];

          if(replaceParents)
          {
            //straight up replacement therapy yo
            this.node.parents = replaceParents;

            //then make sure to update and continue onwards!
            this.update(this.node);
          }
        }
      })

      //we've replaced the innards of the object with a better future!
      finished(undefined, tClone);
    }

    self.getReferencesAndParents = function(type, widObjects, finished)
    {

        //listed by some identifier, then the object, we need to look through the type, and pull references
        var fSchema = internalGetFullSchema(type);
        // self.log("Full schema: ", fSchema);
        if(!fSchema)
        {
          finished("Full schema undefined, might be missing a reference type within " + type);
          return;
        } 
        var widToParents = {};
        var traverseObjects = {};

        for(var wid in widObjects){
          widToParents[wid] = {};
          traverseObjects[wid] = traverse(widObjects[wid]);
        }

        
        //for every wid object we see, we loop through and pull that 
        traverse(fSchema).forEach(function(node)
        {
          // self.log("Node: ", this.node, "", " key: ", this.key);
          //if we have a wid object and parents object -- likely we are a tracked reference
          if(this.node.wid && this.node.parents)
          {
            //let's pull these bad boys our of our other objects
            var pathToObject = self.stripObjectPath(this.path);
            
            //if you aren't root, split it up!
            if(pathToObject != "")
              pathToObject = pathToObject.split(self.pathDelimiter);

            // self.log("\nKey before :", this.key, " node-p: ", this.parent.node, " path: ", this.path);
            
            var isArray = (this.key == "properties" && this.path[this.path.length - 2] == "items");
            // self.log("Is array? : ", isArray);
            for(var wid in traverseObjects)
            {

              var wtp = widToParents[wid];
              var tob = traverseObjects[wid];


              //fetch object from our traverse thing using this path
              var arrayOrObject = tob.get(pathToObject);

              // self.log("Path to obj: ", pathToObject, " get: ", arrayOrObject);

              //grab wid to parent mappings, always cloning parent arrays
              if(isArray)
              {
                for(var i=0; i < arrayOrObject.length; i++)
                {
                  var aobj = arrayOrObject[i];
                  //map wid objects to parent wids always thank you
                  wtp[aobj.wid] = aobj.parents.slice(0);
                }
              }
              else
                wtp[arrayOrObject.wid] = arrayOrObject.parents.slice(0);

              //now we've aded a mapping from the objects wid to the parents for that wid

            }
          }
        });

        //we send back the wids of the original widObjects mapped to the wid internal reference && the corresponding parents
        //so many damn layers -- it gets confusing
        finished(undefined, widToParents);

    }


	return self;
}



