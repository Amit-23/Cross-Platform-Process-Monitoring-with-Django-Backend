from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework import status
from django.utils import timezone
from django.conf import settings
from .models import Machine, Process
from .serializers import MachineSerializer
import os


@api_view(["POST"])
def receive_process_data(request):
    if request.headers.get("API-Key") != settings.AGENT_API_KEY:
        return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    hostname = request.data.get("hostname")
    processes = request.data.get("processes", [])

    machine, _ = Machine.objects.get_or_create(hostname=hostname)
    machine.last_updated = timezone.now()
    machine.save()

    Process.objects.filter(machine=machine).delete()  # replace old data

    for proc in processes:
        Process.objects.create(
            machine=machine,
            pid=proc["pid"],
            name=proc["name"],
            cpu_usage=proc["cpu_usage"],
            memory_usage=proc["memory_usage"],
            parent_pid=proc.get("parent_pid")
        )

    return Response({"status": "success"})

@api_view(["GET"])
def get_latest_processes(request):
    machines = Machine.objects.all()
    serializer = MachineSerializer(machines, many=True)
    return Response(serializer.data)
