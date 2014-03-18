
var assert = require('assert');
var should = require('should');

var winschema = require('../');
var winback = require('win-backbone');


var emptyModule = 
{
	winFunction : "test",
	eventCallbacks : function(){ return {}; },
	requiredEvents : function() {
		return [
		"schema:addSchema",
		"schema:getSchema",
		"schema:getSchemaReferences"
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
		};

    	backbone = new winback();

    	//loading modules is synchronous
    	backbone.loadModules(sampleJSON, configurations);

    	var registeredEvents = backbone.registeredEvents();
    	var requiredEvents = backbone.moduleRequirements();
    		
    	console.log('Backbone Events registered: ', registeredEvents);
    	console.log('Required: ', requiredEvents);

    	backbone.initializeModules(function()
    	{
 			done();
    	});

    });

    it('Should add schema successfully',function(done){

    	var exampleSchema  = {
    		hope : "this doesn't work as schema"
    	};

    	//now we call asking for 
    	backbone.emit("test", "schema:addSchema", "exampleSchema", exampleSchema, function(err)
		{
			if(err)
				throw err;

	    	console.log('Finished adding schema, ', exampleSchema);
	    	done();   

		});
    
    });




});