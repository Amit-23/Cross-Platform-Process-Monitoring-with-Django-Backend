from rest_framework import serializers
from .models import Process, Machine

class ProcessSerializer(serializers.ModelSerializer):
    class Meta:
        model = Process
        fields = "__all__"

class MachineSerializer(serializers.ModelSerializer):
    processes = ProcessSerializer(many=True, read_only=True)  

    class Meta:
        model = Machine
        fields = "__all__"
