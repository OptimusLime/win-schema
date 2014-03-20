
var assert = require('assert');
var should = require('should');
var colors = require('colors');

var winschema = require('../');
var winback = require('win-backbone');
var Q = require('q');
var util = require('util');


var cbFunction = function(backbone, defer)
{
	return function() {
		var err = [].shift.call(arguments);

		if(err)
			defer.reject(err);
		else{
			// backbone.log("Arg lenth: ".cyan,arguments.length);
			var nArgs = [];
			for(var i=0; i < arguments.length; i++)
				nArgs.push(arguments[i]);
			//take out the error
			defer.resolve.apply(this, nArgs);
			// backbone.log("Arg after: ".red, arguments);
		}
	};
}

var qBackboneEmit = function()
{
	//defer the mofo please!
	var defer = Q.defer();

	var oArgs = arguments;
	//take out the first arguments
	var backbone =  [].shift.call(oArgs);

	if(typeof backbone == "string")
		throw new Error("Q callback wrong first arg should be backbone, not :" + backbone)

	var cb = cbFunction(backbone, defer);
	[].push.call(oArgs, cb);

	backbone.emit.apply(backbone, oArgs);

	//send back our promise to resolve/reject
	return defer.promise;
}

var emptyModule = 
{
	winFunction : "test",
	eventCallbacks : function(){ return {}; },
	requiredEvents : function() {
		return [
		"schema:addSchema",
		"schema:getSchema",
		"schema:getSchemaReferences",
		"schema:getSchemaProperties",
		"schema:getFullSchema",
		"schema:validate",
		"schema:validateMany"
		];
	},
	initialize : function(done)
    {
        process.nextTick(function()
        {
            done();
        })
    }
};

describe('Testing Win Generating Artifacts -',function(){

    //we need to start up the WIN backend
    before(function(done){

    	var sampleJSON = 
		{
			"win-schema" : winschema,
			"test" : emptyModule
		};

		var configurations = 
		{
			"win-schema" : {
				multipleErrors : true,
				allowAnyObjects : false,
				requireByDefault : false
			}
		};

    	backbone = new winback();
    	backbone.log.logLevel = backbone.log.testing;

    	//loading modules is synchronous
    	backbone.loadModules(sampleJSON, configurations);

    	var registeredEvents = backbone.registeredEvents();
    	var requiredEvents = backbone.moduleRequirements();
    		
    	backbone.log('Backbone Events registered: ', registeredEvents);
    	backbone.log('Required: ', requiredEvents);

    	backbone.initializeModules(function()
    	{
 			done();
    	});

    });

    it('Should add schema successfully',function(done){

    	var otherSchema = {
    		type : "array",
    		things : "string"
    		// {"$ref" : "exampleSchema"}
    	};
    	var exampleSchema  = {
    		// noFirst : "object",
    		// yesFirst : {type: "object", yesSecond: {noThird: "array", noFourth: "object"}},
    		bugger : {aThing : "string", inner: {type: "array", test: "string"}},
    		// noSecond : "array",
    		ref : {"$ref": "secondSchema"},
    		firstArray: {
    			type : "array",
    			"$ref": "secondSchema",
    			// items : {
    				// type : "object",
    				// properties :{
    					// stuff : "string"
    				// }
    			// }
    		}
    		// required : ['hope', 'stuff']		
    	};

    	var thingy = {
    		bugger : {skip : "string"},
    		hope : "stuff",
    		stuff : {
    			num : 4,
    			inner : {

    				geno : {things : []},
    				geno2 : "some string"
    			}
    		}
    	}

    	var validExample = {
    		bugger : {aThing : "help", inner:[]},
    		// hope : { notProp: 5, isProp: 5},
    		ref :[ 
    			{things : "stuff"}
    		],
    		firstArray : [[{things: "stuff"}]],
    		wid : "abcded"
    		,dbType : "exampleSchema"
    		,parents : []
    		// , stuff : {
    			// num : "5",
    			// inner: {
    				// geno : {},
    				// geno2 : "some string"
    			// },
    			// wrong : "things"
    		// },
    		// not : "the right stuff"
    	};

		backbone.log('Adding exampleSchema');
    	qBackboneEmit(backbone, "test",  "schema:addSchema", "exampleSchema", exampleSchema)
    		.then(function()
			{
				backbone.log('Adding secondSchema');
				//add schema without any WIn things attached to it-- with the options param!
		 		return qBackboneEmit(backbone, "test",  "schema:addSchema", "secondSchema", otherSchema, {skipWINAdditions: true});
			})
			.then(function()
			{
				return qBackboneEmit(backbone, "test",  "schema:getSchemaReferences", "exampleSchema");
			})
			.then(function(sRefs)
			{
				backbone.log("\tSchema refs: ".cyan, util.inspect(sRefs, false, 10));
				return qBackboneEmit(backbone, "test",  "schema:getFullSchema", "exampleSchema");
			})
    		.then(function(fullSchema)
    		{	
    			var defer = Q.defer();

    			backbone.log("\tFull schema: ".blue, util.inspect(fullSchema[0], false, 10));

    			backbone.emit("test", "schema:validate", "exampleSchema", validExample, function(err, isValid, issues)
    			{
    				if(err){
    					defer.reject(err);
    					return;
    				}

    				backbone.log('Valid? ' + isValid);

    				if(isValid)
    					should.not.exist(issues);// issues.errors.should.not.exist();
    				else
    					should.exist(issues);
    				// console.log("IsValid: ", isValid, " if no, why not? ", issues);
    				defer.resolve();
    			});

    			return defer.promise;
    		})
    		.then(function()
    		{
		 		return qBackboneEmit(backbone, "test",  "schema:getSchemaProperties", ["exampleSchema", "secondSchema"]);
    		})
    		.then(function(props)
    		{
    			backbone.log("\n\tSchema props: ".magenta, props[0], "\n")
    			backbone.log("\n\tSchema props2: ".magenta, props[1], "\n")
    			var defer = Q.defer();

    			backbone.emit("test", "schema:validateMany", "exampleSchema", [validExample, thingy], function(err, isValid, issues)
    			{
    				if(err){
    					defer.reject(err);
    					return;
    				}

    				backbone.log('Many Valid? ' + isValid);

    				if(!isValid)
    				{
    					var validity = [];
    					for(var i=0; i < issues.length; i++)
    					{
    						backbone.log("Is object " + i + " valid? ".green, (issues[i].length ? "No.".red : "Yes.".blue));
    						var aIssue = issues[i];
    						for(var e=0; e < aIssue.length; e++)
    						{
    							validity.push(aIssue[e].dataPath + "- issue: " + aIssue[e].message);
    						}
    					}
    					throw new Error(JSON.stringify(validity));
    				}
    				// backbone.log("Issues: ", issues);

    				if(isValid)
    					should.not.exist(issues);// issues.errors.should.not.exist();
    				else
    					should.exist(issues);
    				
    				// console.log("IsValid: ", isValid, " if no, why not? ", issues);
    				defer.resolve();
    			});

    			return defer.promise;
    		})
    		.then(function(isValid, issues)
    		{
    			done();
    		})
    		.fail(function(err){
    			// backbone.log('Error found: ', err);
    			
    			err = typeof err == "string" ? new Error(err) : err;
    			done(err);
    		});

    });




});