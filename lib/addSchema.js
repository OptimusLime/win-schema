//pull in traverse object for this guy
var traverse = require('optimuslime-traverse');
var schemaSpec = require('./schemaSpec');


module.exports = extendAddSchema;

function extendAddSchema(self)
{

  var pathDelim = self.pathDelimiter;

  var defaultWINAdd = {
    wid : "string",
    dbType : "string",
    parents : {
      type: "array",
      items : {
        type : "string"
      }
    }
  }

  var winTypeRegExp = [];
  for(var key in defaultWINAdd)
  {
    winTypeRegExp.push(key);
  }
  self.log("--All WIN keywords: ", winTypeRegExp);

  winTypeRegExp = new RegExp("\\b" + winTypeRegExp.join("\\b|\\b") + "\\b");

  //everything we need to do to add a schema inside
  //this requires checking if it's properly formatted, pulling references, and moving
  //around things if it's not formatted but we would like to make it less wordy to make schema
    self.internalAddSchema = function(type, schemaJSON, options, finished)
    {
      if(typeof options == "function")
      {
        finished = options;
        options = {};
      }
      else
        options = options || {};

      //make a clone of the object 
      schemaJSON = JSON.parse(JSON.stringify(schemaJSON)); 

      //we add or move objects inside the schema to make it conform to expected v4 JSON schema validation
      appendSchemaInformation(schemaJSON, options);      

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

        //when we create it 
        setSchemaProperties(type, schemaJSON, options);
        //take what you want, and give nothing back! The pirates way for us!
        finished();
      }
    }
    function setSchemaProperties(type, schemaJSON, options)
    {
      var props = {};
      if(options.skipWINAdditions)
        props.isWIN = false;
      else
        props.isWIN = true;
      
      var primePaths = {};

      var tJSON = traverse(schemaJSON);

      var references = self.requiredReferences[type];
      var refMap = {};

      for(var refType in references)
      {
          var locations = references[refType];
          for(var l =0; l < locations.length; l++)
          {
              var refInfo = locations[l];
              refMap[refInfo.typePath] = refInfo;
          }
      }
      // self.log("Refmap: ", refMap);
      function isRef(path){ return refMap[path.join(pathDelim)]}

      tJSON.forEach(function(node)
      {
        if(this.isRoot || this.isLeaf)
          return;

        //kill the future investigation of references
        if(isRef(this.path))
            this.keys = [];

          //if we are a known keyword -- that's not properties or items, we skip you!
        if(this.key != "properties" && this.key != "items" && self.keywordRegExp.test(this.key))
          this.keys = [];

        //we also ignore this as well
        if(winTypeRegExp.test(this.key))
          this.keys = [];

        // self.log("Isref?".green, isRef(this.path));

        // if(this.keys.length)
          // self.log("Potential PrimePath: ".green, this.key, " node: ", this.node);

        if(this.keys.length){

          var objPath = stripObjectPath(this.path);

          //we're an array, or we're inisde an array!
          if(this.node.type == "array" || this.node.items || this.key =="items")
          {
              //we are an array, we'll pull the array info -- and then we close off this array -- forever!
              //remember, primary paths are all about the objects, and the FIRST layer of array
              primePaths[objPath] = {type: "array"};
              this.keys = [];
          }
          else
          {
            //you must be a properties object
            //either you have a type, or you're an object
            primePaths[objPath] = {type: this.node.type || "object"};
          }
        }
        

      })

      // self.log("\n\tprimaryPaths: ".cyan, primePaths);

      self.primaryPaths[type] = primePaths;
      self.typeProperties[type] = props;

    }
    function hasNonKeywords(obj)
    {
      var hasNonKeywords = false;
        
      if(Array.isArray(obj))
      {
        //loop through object to grab keys
        for(var i=0; i < obj.length; i++)
        {
          var iKey = obj[i];
          //check if you're not a keyword
          if(!self.keywordRegExp.test(iKey))
          {
            //just one is enough
            hasNonKeywords = true;
            break;
          }
        }
      }
      else
      {
        for(var iKey in obj)
        {
          if(!self.keywordRegExp.test(iKey))
          {
            //just one is enough
            hasNonKeywords = true;
            break;
          }
        }
      }

      return hasNonKeywords;           
    }

  //handle everything associated with adding a schema
    function checkSchemaErrors(schemaJSON)
    {

      //check against the proper schema definition
      // var vck = self.validator.validateMultiple(schemaJSON, schemaSpec, true);
       var valCheck = self.validateFunction.apply(self.validator, [schemaJSON, schemaSpec, true]);
       
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
       if(!schemaJSON.properties && !schemaJSON.items)
       {
          checkErrors["root"] = "No properties/items defined at root. Schema has no validation without properties!";
          checkErrors.length++;
       }

       //going to need to traverse our schema object
       var tJSON = traverse(schemaJSON);

       tJSON.forEach(function(node)
       {
        //skip the root please
        if(this.isRoot || this.path.join(pathDelim).indexOf('required') != -1)
          return;

        //this should be a warning
        if(!self.requireByDefault && !this.isLeaf && !this.node.required)
        {
            //if you don't have a required object, then you're gonna have a bad time
            //this is a warning
            checkWarnings[this.path.join(pathDelim)] = "warning: if you disable requireByDefault and don't put require arrays, validation will ignore those properties.";
            checkWarnings.length++;

        }
        if(this.key == "properties" && this.node.properties)
        {
           checkErrors[this.path.join(pathDelim)] = "Properties inside properties is meaningless.";
           checkErrors.length++;
        }
        if(this.key == "type" && typeof this.node != "string")
        {
            //for whatever reason, there is a type defined, but not a string in it's place? Waa?
            checkErrors[this.path.join(pathDelim)] = "Types must be string";
            checkErrors.length++;
        }
        if(this.key == "type" && !self.typeRegExp.test(this.node))
        {
           checkErrors[this.path.join(pathDelim)] = "Types must be one of " + validTypes + " not " + this.node;
           checkErrors.length++;
        }
        if(this.isLeaf)
        {
          //if you don't have a type, and there is no ref object
          if(!this.parent.node.properties && (this.key != "type" && this.key != "$ref") && !this.parent.node.type && !this.parent.node["$ref"])
          {
              checkErrors[this.path.join(pathDelim)] = "Object doesn't have any properties, a valid type, or a reference, therefore it is invalid in the WIN spec.";
              checkErrors.length++;
          }
        }
        //not a leaf, you don't have a reference
        if(!self.allowAnyObjects && !this.isLeaf && !this.node["$ref"] )
        {
          //special case for items -- doesn't apply
          if(this.node.type == "object" && this.key != "items")
          {
            //we're going to check if the list of keys to follow have any non keywords
            //for instance if {type: "object", otherThing: "string"} keys = type, otherThing
            //if instead it's just {type : "object", required : []}, keys = type, required 
            //notice that the top has non-keyword keys, and the bottom example does not 
            //we're looking for the bottom example and rejecting it
            var bHasNonKeywords = hasNonKeywords(this.keys);
            
            //if you ONLY have keywords -- you don't have any other object types
            //you are a violation of win spec and you allow any object or array to be passed in
            if(!bHasNonKeywords){
              // self.log("Current: ".magenta, this.key, " Keys: ".cyan, this.keys || "none, node: " + this.node, " has non? ".red + bHasNonKeywords);
              checkErrors[this.path.join(pathDelim)] = "AllowAnyObjects is off, therefore you cannot simple have an 'object' type with no inner properties";
              checkErrors.length++;
            }
          }
          else if(this.node.type == "array")
          {
            //if you are an array and you have no items -- not allowed!
            if(!this.node.items){
              // self.log("Current: ".magenta, this.key, " Keys: ".cyan, this.keys || "none, node: " + this.node, " has non? ".red + bHasNonKeywords);
              checkErrors[this.path.join(pathDelim)] = "AllowAnyObjects is off, therefore you cannot simple have an 'array' type with no inner items";
              checkErrors.length++;
            }
            else
            {
              //if you have a ref -- you're okay for us!
              var bIemsHaveNonKey = this.node.items["$ref"] || this.node.items["type"] || hasNonKeywords(this.node.items.properties || {});
               if(!bIemsHaveNonKey){
                // self.log("Current: ".magenta, this.key, " Keys: ".cyan, this.keys || "none, node: " + this.node, " has non? ".red + bHasNonKeywords);
                checkErrors[this.path.join(pathDelim)] = "AllowAnyObjects is off, therefore you cannot simple have an 'array' type with no non-keyword inner items";
                checkErrors.length++;
              }
            }
          }
        
        }
        //if you're an array
        if(this.node.type == "array")
        {
          //grab your items
          var items = this.node.items;
          if(!items && !self.allowAnyObjects)
          {
             checkErrors[this.path.join(pathDelim)] = "AllowAnyObjects is off for arrays, therefore you cannot simple have an 'array' type with no inner items";
              checkErrors.length++;
          }
          else
          {
            items = items || {};
            //we have items -- we shouldn't have a reference type && other items
            if(items.properties && items["$ref"])
            {
              checkErrors[this.path.join(pathDelim)] = "Array items in WIN cannot have properties AND a reference type. One or the other.";
              checkErrors.length++;
            }
          }
        }


       });

       if(checkErrors.length || checkWarnings.length)
        return {errors: checkErrors, warnings: checkWarnings};
      else
        return null;

    }

    function stripObjectPath(path)
    {
      //obj path will be returned
      var objectPath = [];

      //travere this path, yo
      traverse(path).forEach(function()
      {
        //no routes including properties or items -- made up schema info!
        if(!this.isRoot && (this.node != "properties" && this.node != "items"))
          objectPath.push(this.node);
      });

      return objectPath.join(pathDelim);
    }

    //storing the references inside of a schema object (if we don't already know them)
    function parseSchemaReferences(schemaJSON)
    {
    	//first we wrap our object with traverse methods
    	var tJSON = traverse(schemaJSON);

    	var references = {};

    	self.log('--  Parsing refs -- ');
      // self.log(schemaJSON);
    	//now we step through pulling the path whenever we hit a reference
    	tJSON.forEach(function(node)
    	{
    		//we are at a reference point
        //we make an exception for arrays -- since the items object can hold references!
        if(this.node["$ref"] && (this.key == "items" || !self.keywordRegExp.test(this.key)))
    		// if(this.isLeaf && this.key == "$ref")
    		{
    			//todo logic for when it's "oneOf" or other valid JSON schema things
    			var fullPath = this.path.join(pathDelim);//this.path.slice(0, this.path.length-1).join(pathDelim);
    			var referenceType = this.node["$ref"];

          
          var objectPath = stripObjectPath(this.path);

          //pull the "items" piece out of the path -- otherwise, if you're just a normal object -- it's the same as fullPath
          var typePath = this.key == "items" ? this.path.slice(0, this.path.length-1).join(pathDelim) : fullPath;



    			if(references[fullPath])
    			{
    				throw new Error("Not yet supported reference behavior, arrays of references: ", fullPath);
    			}

          //assuming type is defined here!
    			references[fullPath] = {schemaType: referenceType, schemaPath: fullPath, objectPath: objectPath, typePath: typePath};
          self.log(self.log.testing, 'Reference detected @ '+fullPath+': ', references[fullPath]);
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
        var schemaInfo = self.schemaReferences[type][path];
        var refType = schemaInfo.schemaType;
        var aReqRefs = self.requiredReferences[type][refType];

        if(!aReqRefs)
        {
          aReqRefs = [];
          self.requiredReferences[type][refType] = aReqRefs;
        }
        //value is the reference type 
        aReqRefs.push(schemaInfo);
      }


      //now we know all the references, their paths, and what type needs what references
    }
    function moveAllToProperties(tJSON)
    {
       tJSON.forEach(function(node)
       {          

          // self.log("Investigating: ", this.key, " @ ", this.path.join(pathDelim), " all keys: ", this.keys);
          //for all non-arrays and non-leafs and non-properties object -- move to a properties object if not a keyword!
          if(!this.isLeaf && this.key != "properties" && !Array.isArray(this.node))
          {

            //movement dpeends on what type you are -- arrays move to items, while objects move to properties
            var moveLocation = "properties";
            if(this.node.type == "array")
              moveLocation = "items";

            // self.log('Movement: ', this.key, " @ ", this.path.join(pathDelim) + " : ", this.node);
            // self.log("Move to : ".green + moveLocation);


            // self.log("Move innitiated: ".magenta, this.node);
            // self.log('Original node: '.green, node);
            var empty = true;
            var move = {};
            //any key that isn't one of our keywords is getting moved inside!
            for(var key in this.node){
                if(!self.keywordRegExp.test(key)){
                  // self.log('Moving key @ ', this.path.join(pathDelim) || "Is root? ", " : ", this.key || this.isRoot); 
                  move[key] = this.node[key];
                  empty = false;
                }
            }

            //don't move nothing derrr
            if(!empty)
            {
               // self.log('Moving: '.red, move);

              //create proeprties if it doesn't exist
              node[moveLocation] = node[moveLocation] || {};

              for(var key in move)
              {
                //move to its new home
                node[moveLocation][key] = move[key];
                //remove from previous location 
                delete node[key];
              }

              //make sure to update, thank you
              this.update(node);

              //we need to investigate the newly created properties/items object -- to continue down the rabbit hole
              this.keys.push(moveLocation);
            }
           

          }
       });
    }
    function addWINTypes(schemaJSON, options)
    {
      for(var key in defaultWINAdd)
      {
        var winAdd = defaultWINAdd[key];
        
        //if it's just a shallow string -- add it directly
        if(typeof winAdd == "string")
          schemaJSON[key] = winAdd;
        else //otehrwise, we should clone the larger object
          schemaJSON[key] = traverse(defaultWINAdd[key]).clone();
      }
    }
    function appendSchemaInformation(schemaJSON, options)
    {
      //add in default win types
      if(!options.skipWINAdditions)
        addWINTypes(schemaJSON, options);

      //build a traverse object for navigating and updating the object
      var tJSON = traverse(schemaJSON);

      //step one convert string to types
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

        if(this.node)
        {

         if(this.node.items && !this.node.type)
          {
            this.node.type = "array";
            needsUpdate = true;
          }

          //rewrite {type : "array", "$ref" : "something"} => {type : "array", items : {"$ref" : "something"}}
          if(this.node.type == "array" && this.node["$ref"])
          {
            this.node.items = this.node.items || {};
            this.node.items["$ref"] = this.node["$ref"];
            delete this.node["$ref"];
            needsUpdate = true;
          }

        }


        if(needsUpdate)
          this.update(node);

      })

      //update location of objects to match validation issues
      //json schema won't validate outside of properties object -- which some people may forget
      //this is basically a correct method
      moveAllToProperties(tJSON);

      // var util = require('util');
      // self.log("Post move schema: ".cyan, util.inspect(schemaJSON, false, 10));

      tJSON.forEach(function(node)
      {
        var needsUpdate = false;


       
          //if we aren't a leaf object, we are a full object
          //therefore, we must have required (since we're in default mode)
          //since we cover the properties object inside, we don't need to go indepth for that key too!
        if(self.requireByDefault && !this.isLeaf && !this.node.required && !Array.isArray(this.node))
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



