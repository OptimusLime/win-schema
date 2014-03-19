//pull in the validating workhorse -- checks schema and stuff
var tv4 = require('tv4');
//pull in traverse object from the repo please!
var traverse = require('optimuslime-traverse');

//pull in the object that knows what all schema look like!
var schemaSpec = require('./schemaSpec');

module.exports = winSchema;

function winSchema(winback, configuration)
{
	//load up basic win-module stufffff
	var self = this;

	self.bb = winback;

	self.validator = tv4.freshApi();

	self.winFunction = "schema";

  self.multipleErrors = (configuration.multipleErrors == true || multipleErrors.multipleErrors == "true");
  //by default you can have unknown keys -- the server environment may desire to change this
  //if you don't want to be storing 
  self.allowUnknownKeys = configuration.allowUnknownKeys || true;

  //all keys are required by default -- this adds in required objects for everything
  self.requireByDefault = configuration.requireByDefault || true;

    self.eventCallbacks = function()
    {
        var callbacks = {};

        //add callbacks to the object-- these are the functions called when the full event is emitted
        callbacks["schema:validate"] = self.validate;
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
    var schemaReferences = {};
    var requiredReferences = {};

    var validTypes = schemaSpec.definitions.simpleTypes.enum.join('|'); //['object', 'array', 'number', 'string', 'boolean', 'null'].join('|');
    var typeRegExp = new RegExp(validTypes);

    var specKeywords = ["\\$ref|\\b\\wid"];
    for(var key in schemaSpec.properties)
      specKeywords.push(key.replace('$', '\\$'));

    //join using exact phrasing checks
    specKeywords = specKeywords.join('\\b|\\b') + "\\b";
    var kewordRegExp = new RegExp(specKeywords);

    console.log("--Specced keywords: ".green, specKeywords);

    var validateFunction = (self.multipleErrors ? self.validator.validateMultiple : self.validator.validateResult);
    var errorKey = self.multipleErrors ? "errors" : "error";

    var checkSchemaErrors = function(schemaJSON)
    {

      //check against the proper schema definition
       var valCheck = validateFunction(schemaJSON, schemaSpec, true);
       
       if(!valCheck.valid)
       {
          console.log("Invalid from schema perspective: ".cyan, valCheck[errorKey]);

          return valCheck[errorKey];
       }

       //grab all possible errors
       var checkErrors = {length: 0};

       //make sure we have some properties -- otherwise there is literally no validation
       if(!schemaJSON.properties)
       {
          checkErrors["root"] = "No properties defined at root. Schema has no validation without properties!";
          checkErrors.length++;
       }

       var tJSON = traverse(schemaJSON);

      // console.log("Full schema:" + schemaJSON)

       tJSON.forEach(function(node)
       {

        //skip the root please
        if(this.isRoot || this.path.join('/').indexOf('required') != -1)
          return;

        if(!this.isLeaf && !this.node.required)
        {
            //every nonleaf MUST have a required object
            //in theory, we should check that the required object matches all keys
            // checkErrors[this.path.join('/')] = "WIN Schema spec says no filler space in v4 JSON Schema. All non-leaf nodes must have a properties object.";
            // checkErrors.length++;
        }
        else if(this.key == "properties" && this.parent.node.properties)
        {
          console.log("Prop read--".red + " Node: ", this.node, " parent: ", this.parent.node);
           checkErrors[this.path.join('/')] = "Properties inside properties is meaningless";
           checkErrors.length++;
        }
        else if(this.key == "type" && typeof this.node != "string")
        {
            //for whatever reason, there is a type defined, but not a string in it's place? Waa?
            checkErrors[this.path.join('/')] = "Types must be string";
            checkErrors.length++;
        }
        else if(this.key == "type" && !typeRegExp.test(this.node))
        {
           checkErrors[this.path.join('/')] = "Types must be one of " + validTypes + " not " + this.node;
           checkErrors.length++;
        }
        else if(this.isLeaf)
        {
          //if you don't have a type, and there is no ref object
          if((this.key != "type" && this.key != "$ref") && !this.parent.node.type && !this.parent.node["$ref"])
          {
              // checkErrors[this.path.join('/')] = "WARNING- Object isn't a type or a reference, therefore it is invalid in the WIN spec.";
              // checkErrors.length++;
          }
        }

       });

       if(checkErrors.length)
        return checkErrors;
      else
        return null;

    }

    //storing the references inside of a schema object (if we don't already know them)
    var parseSchemaReferences = function(schemaJSON)
    {
    	//first we wrap our object with traverse methods
    	var tJSON = traverse(schemaJSON);

    	var references = {};

    	console.log('--  Parsing refs -- ');
    	//now we step through pulling the path whenever we hit a reference
    	tJSON.forEach(function(node)
    	{
    		//we are at a reference point
    		if(this.isLeaf && this.key == "$ref")
    		{
    			//todo logic for when it's "oneOf" or other valid JSON schema things
    			var fullPath = this.path.slice(0, this.path.length-1).join('/');
    			var referenceType = this.node;

    			if(references[fullPath])
    			{
    				throw new Error("Not yet supported reference behavior, arrays of references: ", fullPath);
    			}

    			references[fullPath] = referenceType;
    		}
    	});

    	console.log("-- Full refs -- ", references);

    	return references;
    } 

    var storeSchemaReferences = function(type, schemaJSON)
    {
    	schemaReferences[type] = parseSchemaReferences(schemaJSON);

      requiredReferences[type] = {};

      for(var path in schemaReferences[type])
      {
        var refType = schemaReferences[type][path];
        //value is the reference type 
        requiredReferences[type][refType] = path;
      }

      //now we know all the references, their paths, and what type needs what references
    }
    var moveAllToProperties = function(tJSON)
    {
       tJSON.forEach(function(node)
       {
          //for all non-arrays and non-leafs and non-properties object -- move to a properties object if not a keyword!
          if(!this.isLeaf && this.key != "properties" && !Array.isArray(this.node))
          {
            console.log('Original node: '.green, node);
            var empty = true;
            var move = {};
            //any key that isn't one of our keywords is getting moved inside!
            for(var key in this.node){
                if(!kewordRegExp.test(key)){
                  console.log('Moving key @ ', this.path.join('/') || "Is root? ", " : ", this.key || this.isRoot); 
                  move[key] = this.node[key];
                  empty = false;
                }
            }

            //don't move nothing derrr
            if(!empty)
            {
               console.log('Moving: '.red, move);

              //create proeprties if it doesn't exist
              this.node.properties = this.node.properties || {};

              for(var key in move)
              {
                //move to its new home
                this.node.properties[key] = move[key];
                //remove from previous location 
                delete this.node[key];
              }

              console.log('Updating to node: '.cyan, node);

              //make sure to update, thank you
              this.update(node);
            }
           

          }
       });
    }
    var appendSchemaInformation = function(schemaJSON)
    {
      var tJSON = traverse(schemaJSON);

      //update location of objects to match validation issues
      //json schema won't validate outside of properties object -- which some people may forget
      //this is basically a correct method
      moveAllToProperties(tJSON);

      console.log("Prop after: ".magenta, JSON.stringify(schemaJSON));

      if(self.requireByDefault)
      {
        var tJSON = traverse(schemaJSON);

        tJSON.forEach(function(node)
        {
          var needsUpdate = false;

            //if we aren't a leaf object, we are a full object
            //therefore, we must have required (since we're in default mode)
            //since we cover the properties object inside, we don't need to go indepth for that key too!
          if(!this.isLeaf && !this.node.required && !Array.isArray(this.node))
          {
            //the require needs to be filled iwth all the properties of this thing, except
            //for anything defined by v4 json schema -- so we run a regex to reject those keys
            var reqProps = [];

            // console.log("Not leaf: ".magenta, this.node, " Key : ", this.key);

            //do not do this if you're in the properties object
            //since the prop keys belong to the PARENT not the node
            if(this.key != "properties")
            {
              for(var key in this.node){
                if(!kewordRegExp.test(key)){
                // console.log('Key added: '.red, key);

                  reqProps.push(key);
                }
              }
              // console.log('Post not props: '.blue, reqProps);
            }
            
            //for every object, you can also have a properties object too
            //required applies to the subling property object as well
            //so we loop through the properties object as well
           for(var key in this.node.properties){
              if(!kewordRegExp.test(key)){
                reqProps.push(key);
              }
            }


            if(reqProps.length)
            {
              node.required = reqProps;
              needsUpdate = true;
            }        
          }

          //if you're an object or an array, in order to be validated -- your type should match appropriately
          //ignore any reference types -- none of our beeswax
          //also, don't be silly and define the properties object
          // if(!this.isLeaf && !this.node.type && !this.node["$ref"] && this.key != "properties" && !Array.isArray(this.node))
          // {
          //   if(this.node.items)
          //     this.node.type = "array";
          //   else 
          //     this.node.type = "object";

          //   needsUpdate = true;
          // }

         if(needsUpdate){
            // console.log('New required - : ', this.node, ' : ', reqProps);
            this.update(node);
          }
        });
        console.log("--post traverse -- ", schemaJSON);

      }



    }

    self.validate = function(type, object, finished)
    {
      if(!allSchema[type]){
        finished("Schema type not loaded: ", type);
        return;
      }

      //we have to manually detect missing references -- since the validator is not concerned with such things
      //FOR WHATEVER REASON
      var missing = self.validator.getMissingUris();
      for(var i=0; i < missing.length; i++)
      {
        //if we have this type inside our refernces for this object, it means we're missing a ref schema for this type!
        if(requiredReferences[type][missing[i]])
        {
          finished("Missing at least 1 schema definition: " + missing[i]);
          return;
        }
      }

      console.log("Validate: ", object);

      //now we need to validate, we definitely have all the refs we need


      var schema = self.validator.getSchema(type);
      console.log('validate against: ', schema);
    	//validate against what type?
    	var result = validateFunction(object, self.validator.getSchema(type), true, !self.allowUnknownKeys);

      // console.log('Missing Validation: ', self.validator.getMissingUris());
      console.log("Result: ", result);

      //-- 
      if(!self.validator.missing.length)
      {
        //if we have errors, they'll be passed on thank you!
          finished(undefined, result.valid, result[errorKey]);
      }
      else
        finished("missing schema definitions: " + JSON.stringify(self.validator.missing));

    }

    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.addSchema = function(type, schemaJSON, finished)
   	{

      //make a clone of the object 
      schemaJSON = JSON.parse(JSON.stringify(schemaJSON)); 

      appendSchemaInformation(schemaJSON);
      

      //check our schema for wacky errors!
      var schemaCheck = checkSchemaErrors(schemaJSON);
      if(schemaCheck)
      {
        finished("Improper schema format for " + type + " - " + JSON.stringify(schemaCheck));
        return;
      }
      //save it in our map
      allSchema[type] = schemaJSON;

   		if(!schemaJSON.id || schemaJSON.id != type)
   			schemaJSON.id = type;

      if(!schemaJSON['$schema'])
        schemaJSON['$schema'] = "http://json-schema.org/draft-04/schema#";
      
      if(!schemaJSON.type)
        schemaJSON.type = "object";

   		//add the schema to our validator -- this does most heavy lifting for us
   		self.validator.addSchema(schemaJSON);

   		var map  = self.validator.getSchemaMap();
   		console.log("Schema map: " , map);
   		var arr = self.validator.getSchemaUris();///^https?://example.com/);
   		console.log("Check refs: ", arr);
   		// console.log('Parsed')

   		//failed to add schema for some reason?
   		if(self.validator.error){
   			finished(self.validator.error);
   		}
   		else
   		{
   			//no error from validator, store the references inside
   			storeSchemaReferences(type, schemaJSON);
   			//take what you want, and give nothing back! The pirates way for us!
   			finished();
   		}
   	}

   	    //todo: pull reference objects from schema -- make sure those exist as well?
   	self.getSchema = function(type, finished)
   	{
   		if(!allSchema[type]){
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
		if(!allSchema[type]){
   			finished("Schema type not loaded: ", type);
   			return;
   		}

   		//pull reference objects
   		finished(undefined, schemaReferences[type]);
   	}

	return self;
}



