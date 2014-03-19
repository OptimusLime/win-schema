//pull in traverse object for this guy
var traverse = require('optimuslime-traverse');
var schemaSpec = require('./schemaSpec');


module.exports = extendAddSchema;

function extendAddSchema(self)
{

  //everything we need to do to add a schema inside
  //this requires checking if it's properly formatted, pulling references, and moving
  //around things if it's not formatted but we would like to make it less wordy to make schema
    self.internalAddSchema = function(type, schemaJSON, finished)
    {
      //make a clone of the object 
      schemaJSON = JSON.parse(JSON.stringify(schemaJSON)); 

      //we add or move objects inside the schema to make it conform to expected v4 JSON schema validation
      appendSchemaInformation(schemaJSON);      

      //check our schema for wacky errors!
      var schemaCheck = checkSchemaErrors(schemaJSON);
      if(schemaCheck && schemaCheck.errors)
      {
        finished("Improper schema format for " + type + " - " + JSON.stringify(schemaCheck));
        return;
      }

      if(schemaCheck && schemaCheck.warnings)
      {
        self.log("Warnings: ".yellow, schemaCheck.warnings);
      }

      //save it in our map
      self.allSchema[type] = schemaJSON;

      if(!schemaJSON.id || schemaJSON.id != type)
        schemaJSON.id = type;

      if(!schemaJSON['$schema'])
        schemaJSON['$schema'] = "http://json-schema.org/draft-04/schema#";
      
      if(!schemaJSON.type)
        schemaJSON.type = "object";

      //add the schema to our validator -- this does most heavy lifting for us
      self.validator.addSchema(schemaJSON);

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

  //handle everything associated with adding a schema
    function checkSchemaErrors(schemaJSON)
    {

      //check against the proper schema definition
       var valCheck = self.validateFunction(schemaJSON, schemaSpec, true);
       
       //grab all possible errors
       var checkErrors = {length: 0};
       var checkWarnings = {length: 0};

       //if we're valid -- which we almost certainly are -- just keep going
       if(!valCheck.valid)
       {
          //let it be known -- this is a weird error
          self.log("Invalid from v4 JSON schema perspective: ", valCheck[errorKey]);

          checkErrors["root"] = valCheck[errorKey];
          checkErrors.length++;

          //not valid, throw it back
          return checkErrors;
       }


       //make sure we have some properties -- otherwise there is literally no validation/
       //during the move process, this is overridden, but it's a good check nonetheless
       if(!schemaJSON.properties)
       {
          checkErrors["root"] = "No properties defined at root. Schema has no validation without properties!";
          checkErrors.length++;
       }

       //going to need to traverse our schema object
       var tJSON = traverse(schemaJSON);

       tJSON.forEach(function(node)
       {
        //skip the root please
        if(this.isRoot || this.path.join('/').indexOf('required') != -1)
          return;

        //this should be a warning
        if(!self.requireByDefault && !this.isLeaf && !this.node.required)
        {
            //if you don't have a required object, then you're gonna have a bad time
            //this is a warning
            checkWarnings[this.path.join('/')] = "warning: if you disable requireByDefault and don't put require arrays, validation will ignore those properties.";
            checkWarnings.length++;

        }
        if(this.key == "properties" && this.node.properties)
        {
           checkErrors[this.path.join('/')] = "Properties inside properties is meaningless.";
           checkErrors.length++;
        }
        if(this.key == "type" && typeof this.node != "string")
        {
            //for whatever reason, there is a type defined, but not a string in it's place? Waa?
            checkErrors[this.path.join('/')] = "Types must be string";
            checkErrors.length++;
        }
        if(this.key == "type" && !self.typeRegExp.test(this.node))
        {
           checkErrors[this.path.join('/')] = "Types must be one of " + validTypes + " not " + this.node;
           checkErrors.length++;
        }
        if(this.isLeaf)
        {
          //if you don't have a type, and there is no ref object
          if(!this.parent.node.properties && (this.key != "type" && this.key != "$ref") && !this.parent.node.type && !this.parent.node["$ref"])
          {
              checkErrors[this.path.join('/')] = "Object doesn't have any properties, a valid type, or a reference, therefore it is invalid in the WIN spec.";
              checkErrors.length++;
          }
        }
        //not a leaf, you don't have a reference
        if(!self.allowAnyObjects && !this.isLeaf && !this.node["$ref"] && (this.node.type == "object" || this.node.type == "array"))
        {
          var hasNonKeywords = false;
          //we're going to check if the list of keys to follow have any non keywords
          //for instance if {type: "object", otherThing: "string"} keys = type, otherThing
          //if instead it's just {type : "object", required : []}, keys = type, required 
          //notice that the top has non-keyword keys, and the bottom example does not 
          //we're looking for the bottom example and rejecting it
          for(var i=0; i < this.keys.length; i++)
          {
            var iKey = this.keys[i];
            //check if you're not a keyword
            if(!self.keywordRegExp.test(iKey))
            {
              //just one is enough
              hasNonKeywords = true;
              break;
            }
          }

          //if you ONLY have keywords -- you don't have any other object types
          //you are a violation of win spec and you allow any object or array to be passed in
          if(!hasNonKeywords){
            // self.log("Current: ".magenta, this.key, " Keys: ".cyan, this.keys || "none, node: " + this.node, " has non? ".red + hasNonKeywords);
            checkErrors[this.path.join('/')] = "AllowAnyObjects is off, therefore you cannot simple have an 'object' or 'array' type with no inner properties";
            checkErrors.length++;
          }
        }

       });

       if(checkErrors.length || checkWarnings.length)
        return {errors: checkErrors, warnings: checkWarnings};
      else
        return null;

    }

    //storing the references inside of a schema object (if we don't already know them)
    function parseSchemaReferences(schemaJSON)
    {
    	//first we wrap our object with traverse methods
    	var tJSON = traverse(schemaJSON);

    	var references = {};

    	self.log('--  Parsing refs -- ');
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

    	self.log("-- Full refs -- ", references);

    	return references;
    } 

    function storeSchemaReferences(type, schemaJSON)
    {
    	self.schemaReferences[type] = parseSchemaReferences(schemaJSON);

      self.requiredReferences[type] = {};

      for(var path in self.schemaReferences[type])
      {
        var refType = self.schemaReferences[type][path];
        //value is the reference type 
        self.requiredReferences[type][refType] = path;
      }

      //now we know all the references, their paths, and what type needs what references
    }
    function moveAllToProperties(tJSON)
    {
       tJSON.forEach(function(node)
       {
          //for all non-arrays and non-leafs and non-properties object -- move to a properties object if not a keyword!
          if(!this.isLeaf && this.key != "properties" && !Array.isArray(this.node))
          {
            // self.log('Original node: '.green, node);
            var empty = true;
            var move = {};
            //any key that isn't one of our keywords is getting moved inside!
            for(var key in this.node){
                if(!self.keywordRegExp.test(key)){
                  // self.log('Moving key @ ', this.path.join('/') || "Is root? ", " : ", this.key || this.isRoot); 
                  move[key] = this.node[key];
                  empty = false;
                }
            }

            //don't move nothing derrr
            if(!empty)
            {
               // self.log('Moving: '.red, move);

              //create proeprties if it doesn't exist
              this.node.properties = this.node.properties || {};

              for(var key in move)
              {
                //move to its new home
                this.node.properties[key] = move[key];
                //remove from previous location 
                delete this.node[key];
              }

              // self.log('Updating to node: '.cyan, node);

              //make sure to update, thank you
              this.update(node);
            }
           

          }
       });
    }
    
    function appendSchemaInformation(schemaJSON)
    {
      var tJSON = traverse(schemaJSON);

      //update location of objects to match validation issues
      //json schema won't validate outside of properties object -- which some people may forget
      //this is basically a correct method
      moveAllToProperties(tJSON);

      //build a traverse object for navigating and updating the object
      var tJSON = traverse(schemaJSON);

      tJSON.forEach(function(node)
      {
        var needsUpdate = false;

        //if you are a leaf -- and you only dictate the type e.g. string/number/array etc -- we'll convert you to proper type
        if(this.isLeaf && typeof this.node == "string")
        {
          //if the key is not a known keyword, and the node string is a proper type
          if(!self.keywordRegExp.test(this.key) && self.typeRegExp.test(node))
          {
            //node is a type!
            node = {type: node};
            needsUpdate = true;
          }
        }
          //if we aren't a leaf object, we are a full object
          //therefore, we must have required (since we're in default mode)
          //since we cover the properties object inside, we don't need to go indepth for that key too!
        else if(self.requireByDefault && !this.isLeaf && !this.node.required && !Array.isArray(this.node))
        {
          //the require needs to be filled iwth all the properties of this thing, except
          //for anything defined by v4 json schema -- so we run a regex to reject those keys
          var reqProps = [];

          // self.log("Not leaf: ".magenta, this.node, " Key : ", this.key);

          //do not do this if you're in the properties object
          //since the prop keys belong to the PARENT not the node
          if(this.key != "properties")
          {
            for(var key in this.node){
              if(!self.keywordRegExp.test(key)){
              // self.log('Key added: '.red, key);

                reqProps.push(key);
              }
            }
            // self.log('Post not props: '.blue, reqProps);
          }
          
          //for every object, you can also have a properties object too
          //required applies to the subling property object as well
          //so we loop through the properties object as well
         for(var key in this.node.properties){
            if(!self.keywordRegExp.test(key)){
              reqProps.push(key);
            }
          }

          if(reqProps.length)
          {
            node.required = reqProps;
            needsUpdate = true;
          }        
        }

       if(needsUpdate){
          // self.log('New required - : ', this.node, ' : ', reqProps);
          this.update(node);
        }
      });
        // self.log("--post traverse -- ", schemaJSON);


    }

	return self;
}



